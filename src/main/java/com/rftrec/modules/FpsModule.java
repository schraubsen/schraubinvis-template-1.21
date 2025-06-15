package com.rftrec.modules;

import com.rftrec.framework.BooleanSetting;
import com.rftrec.framework.Module;

public class FpsModule extends Module {
    private final BooleanSetting showBackground = new BooleanSetting("Background", true);

    public FpsModule() {
        super("FPS");
    }

    @Override
    protected void onEnable() {
        // initialization code
    }
}
