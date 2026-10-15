package io.github.ildargiv.photogeofinder;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.provider.Settings;
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

    /** Opens the app's page in the system settings, where access to photos can be changed. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        openPicker(call);
    }

    /**
     * The phone's own gallery app (Samsung, Xiaomi, Google Photos…), where photos are selected with a tap and
     * which hands out the original files. Without a gallery app, Android's photo picker.
     */
    private void openPicker(PluginCall call) {
        Intent gallery = new Intent(Intent.ACTION_PICK);
        gallery.setDataAndType(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "image/*");
        gallery.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        if (gallery.resolveActivity(getContext().getPackageManager()) != null) {
            startActivityForResult(call, gallery, "picked");
            return;
        }
        PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
            .setMediaType(ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
            .build();
        startActivityForResult(call, new ActivityResultContracts.PickMultipleVisualMedia().createIntent(getContext(), request), "picked");
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
                // Try the ways to the original file in order and keep the first copy that still has GPS
                boolean copied = false, located = false;
                for (Uri source : sources(uri, name)) {
                    if (!copy(source, dest)) continue;
                    copied = true;
                    if (hasLocation(dest)) {
                        located = true;
                        break;
                    }
                }
                if (!copied) continue;
                JSObject f = new JSObject();
                f.put("path", dest.getAbsolutePath());
                f.put("name", name);
                f.put("type", mimeType(uri, name));
                long modified = lastModified(uri);
                if (modified > 0) f.put("lastModified", modified);
                // No GPS and the app is not allowed to see it: the page can suggest opening the settings
                if (!located && !fullAccess()) f.put("locationHidden", true);
                out.put(f);
            } catch (Exception e) {
                Logger.error("PhotoPicker", "Cannot read " + uri, e);
            }
        }
        return out;
    }

    /** Copies through a temporary file, so a failed attempt never spoils an earlier good copy. */
    private boolean copy(Uri source, File dest) {
        File part = new File(dest.getPath() + ".part");
        try (InputStream in = getContext().getContentResolver().openInputStream(source)) {
            if (in == null) return false;
            try (OutputStream os = new FileOutputStream(part)) {
                byte[] buf = new byte[1 << 16];
                int r;
                while ((r = in.read(buf)) > 0) os.write(buf, 0, r);
            }
            dest.delete();
            return part.renameTo(dest);
        } catch (Exception e) {
            Logger.debug("PhotoPicker", "Cannot open " + source + ": " + e.getMessage());
            part.delete();
            return false;
        }
    }

    @SuppressWarnings("deprecation")
    private static boolean hasLocation(File file) {
        try {
            return new ExifInterface(file.getAbsolutePath()).getLatLong(new float[2]);
        } catch (Exception e) {
            return false;
        }
    }

    /** True when Android lets the app read photo locations: always before Android 10, else with both permissions. */
    private boolean fullAccess() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
        String read = Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU ? "photos" : "photosLegacy";
        return getPermissionState("location") == PermissionState.GRANTED && getPermissionState(read) == PermissionState.GRANTED;
    }

    /**
     * Where to read the photo from, best first. The photo picker and the file picker hand out copies without
     * the location; the same photo in the phone's gallery, opened as the original, still has it.
     */
    private List<Uri> sources(Uri uri, String name) {
        List<Uri> list = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && getPermissionState("location") == PermissionState.GRANTED) {
            Uri images = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
            // A document from the file picker that belongs to the gallery
            try {
                if (DocumentsContract.isDocumentUri(getContext(), uri)) {
                    Uri media = MediaStore.getMediaUri(getContext(), uri);
                    if (media != null) list.add(MediaStore.setRequireOriginal(media));
                }
            } catch (Exception ignored) {}
            // A photo from the photo picker: find it in the gallery by name and size
            long size = size(uri);
            if (size > 0) {
                try (
                    Cursor c = getContext()
                        .getContentResolver()
                        .query(
                            images,
                            new String[] { MediaStore.Images.Media._ID },
                            MediaStore.Images.Media.DISPLAY_NAME + "=? AND " + MediaStore.Images.Media.SIZE + "=?",
                            new String[] { name, String.valueOf(size) },
                            null
                        )
                ) {
                    while (c != null && c.moveToNext()) list.add(MediaStore.setRequireOriginal(ContentUris.withAppendedId(images, c.getLong(0))));
                } catch (Exception e) {
                    Logger.debug("PhotoPicker", "Gallery lookup failed for " + name + ": " + e.getMessage());
                }
            }
            if (MediaStore.AUTHORITY.equals(uri.getAuthority())) {
                try {
                    list.add(MediaStore.setRequireOriginal(uri));
                } catch (Exception ignored) {}
            }
        }
        list.add(uri);
        return list;
    }

    private long size(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.SIZE }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getLong(0);
        } catch (Exception ignored) {}
        return 0;
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
