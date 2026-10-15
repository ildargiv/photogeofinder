package io.github.ildargiv.photogeofinder;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhotoPickerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
