package io.github.ildargiv.photogeofinder;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.webkit.MimeTypeMap;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Gives the web app the original photo files, with their GPS data.
 *
 * Android removes the location from photos that apps open unless the app holds ACCESS_MEDIA_LOCATION
 * and asks for the original file. The WebView's own file chooser does neither, so photos are picked
 * here with Android's photo picker, opened as originals, copied into the app's cache and read by the
 * page from there. Photos shared to the app
 * ("Share" or "Open with" in the gallery) go the same way. Nothing leaves the device.
 */
@CapacitorPlugin(
    name = "PhotoPicker",
    permissions = {
        @Permission(alias = "photos", strings = { Manifest.permission.READ_MEDIA_IMAGES }),
        @Permission(alias = "photosLegacy", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_MEDIA_LOCATION })
    }
)
public class PhotoPickerPlugin extends Plugin {

    private static final String DIR = "picked";
    private static final String LOCAL_PICKER = "com.android.providers.media.photopicker";

    @PluginMethod
    public void pick(PluginCall call) {
        List<String> missing = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (getPermissionState("location") != PermissionState.GRANTED) missing.add("location");
            String read = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "photos" : "photosLegacy";
            if (getPermissionState(read) != PermissionState.GRANTED) missing.add(read);
        }
        // Ask once; if the person says no, photos still open, only without GPS on newer Android versions
        if (!missing.isEmpty() && !getActivity().getPreferences(Activity.MODE_PRIVATE).getBoolean("askedMedia", false)) {
            getActivity().getPreferences(Activity.MODE_PRIVATE).edit().putBoolean("askedMedia", true).apply();
            requestPermissionForAliases(missing.toArray(new String[0]), call, "afterPermission");
            return;
        }
        openPicker(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        openPicker(call);
    }

    /** Android's photo picker: a gallery grid where photos are selected with a tap. Older phones get the file picker. */
    private void openPicker(PluginCall call) {
        PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
            .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
            .build();
        Intent intent = new ActivityResultContracts.PickMultipleVisualMedia().createIntent(getContext(), request);
        startActivityForResult(call, intent, "picked");
    }

    @ActivityCallback
    private void picked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            call.resolve(files(new JSArray()));
            return;
        }
        List<Uri> uris = new ArrayList<>();
        ClipData clip = data.getClipData();
        if (clip != null) {
            for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        new Thread(() -> call.resolve(files(copyAll(uris)))).start();
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        List<Uri> uris = sharedUris(intent);
        if (uris.isEmpty()) return;
        // Handle a share only once, also when the activity is recreated
        intent.setAction(Intent.ACTION_MAIN);
        new Thread(() -> notifyListeners("photosShared", files(copyAll(uris)), true)).start();
    }

    @SuppressWarnings("deprecation")
    private static List<Uri> sharedUris(Intent intent) {
        List<Uri> uris = new ArrayList<>();
        if (intent == null || intent.getAction() == null) return uris;
        String type = intent.getType();
        switch (intent.getAction()) {
            case Intent.ACTION_SEND:
                Uri one = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (one != null) uris.add(one);
                break;
            case Intent.ACTION_SEND_MULTIPLE:
                ArrayList<Uri> many = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (many != null) uris.addAll(many);
                break;
            case Intent.ACTION_VIEW:
                if (intent.getData() != null && (type == null || type.startsWith("image/"))) uris.add(intent.getData());
                break;
            default:
                break;
        }
        return uris;
    }

    private static JSObject files(JSArray list) {
        JSObject ret = new JSObject();
        ret.put("files", list);
        return ret;
    }

    /** Copies each batch into its own folder and removes older batches. */
    private synchronized JSArray copyAll(List<Uri> uris) {
        File root = new File(getContext().getCacheDir(), DIR);
        File[] old = root.listFiles();
        if (old != null) for (File d : old) {
            File[] inner = d.listFiles();
            if (inner != null) for (File f : inner) f.delete();
            d.delete();
        }
        File dir = new File(root, String.valueOf(System.currentTimeMillis()));
        dir.mkdirs();
        JSArray out = new JSArray();
        int n = 0;
        for (Uri uri : uris) {
            try {
                String name = displayName(uri);
                File dest = new File(dir, (n++) + "_" + name.replaceAll("[\\\\/:*?\"<>|]", "_"));
                try (InputStream in = openOriginal(uri); OutputStream os = new FileOutputStream(dest)) {
                    if (in == null) continue;
                    byte[] buf = new byte[1 << 16];
                    int r;
                    while ((r = in.read(buf)) > 0) os.write(buf, 0, r);
                }
                JSObject f = new JSObject();
                f.put("path", dest.getAbsolutePath());
                f.put("name", name);
                f.put("type", mimeType(uri, name));
                long modified = lastModified(uri);
                if (modified > 0) f.put("lastModified", modified);
                out.put(f);
            } catch (Exception e) {
                Logger.error("PhotoPicker", "Cannot read " + uri, e);
            }
        }
        return out;
    }

    /** Opens the file with its location data when Android allows it, otherwise as it is. */
    private InputStream openOriginal(Uri uri) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("location") == PermissionState.GRANTED) {
            // The photo picker strips the location. A photo stored on the phone has the same id in the gallery,
            // and with access to the gallery its original file can be opened.
            String path = uri.getPath();
            if (MediaStore.AUTHORITY.equals(uri.getAuthority()) && path != null && path.contains("/picker/") && path.contains(LOCAL_PICKER)) {
                try {
                    Uri local = ContentUris.withAppendedId(
                        MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL),
                        Long.parseLong(uri.getLastPathSegment())
                    );
                    InputStream in = getContext().getContentResolver().openInputStream(MediaStore.setRequireOriginal(local));
                    if (in != null) return in;
                } catch (Exception e) {
                    Logger.debug("PhotoPicker", "Gallery original not available for " + uri + ": " + e.getMessage());
                }
            }
            Uri media = uri;
            try {
                if (DocumentsContract.isDocumentUri(getContext(), uri)) media = MediaStore.getMediaUri(getContext(), uri);
            } catch (Exception ignored) {
                media = null;
            }
            if (media != null && MediaStore.AUTHORITY.equals(media.getAuthority())) {
                try {
                    InputStream in = getContext().getContentResolver().openInputStream(MediaStore.setRequireOriginal(media));
                    if (in != null) return in;
                } catch (Exception e) {
                    Logger.debug("PhotoPicker", "Original not available for " + uri + ": " + e.getMessage());
                }
            }
        }
        return getContext().getContentResolver().openInputStream(uri);
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (Exception ignored) {}
        String last = uri.getLastPathSegment();
        return last != null ? last.substring(last.lastIndexOf('/') + 1) : "photo.jpg";
    }

    private long lastModified(Uri uri) {
        if (!DocumentsContract.isDocumentUri(getContext(), uri)) return 0;
        try (
            Cursor c = getContext()
                .getContentResolver()
                .query(uri, new String[] { DocumentsContract.Document.COLUMN_LAST_MODIFIED }, null, null, null)
        ) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Exception ignored) {}
        return 0;
    }

    private String mimeType(Uri uri, String name) {
        String type = getContext().getContentResolver().getType(uri);
        if (type != null) return type;
        String ext = MimeTypeMap.getFileExtensionFromUrl(name);
        type = ext != null ? MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext.toLowerCase()) : null;
        return type != null ? type : "image/jpeg";
    }
}
