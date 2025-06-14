package com.rftrec;

import com.rftrec.framework.ModuleManager;
import net.fabricmc.api.ClientModInitializer;

public class RFTrecClient implements ClientModInitializer {
    public static final String MOD_ID = "rftrec";
    private static ModuleManager moduleManager;

    @Override
    public void onInitializeClient() {
        moduleManager = new ModuleManager();
        moduleManager.init();
    }

    public static ModuleManager getModuleManager() {
        return moduleManager;
    }
}
