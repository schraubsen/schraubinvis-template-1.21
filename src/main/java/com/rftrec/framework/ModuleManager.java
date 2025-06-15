package com.rftrec.framework;

import com.rftrec.modules.FpsModule;
import java.util.ArrayList;
import java.util.List;

public class ModuleManager {
    private final List<Module> modules = new ArrayList<>();

    public void init() {
        // register modules here
        modules.add(new FpsModule());
    }

    public List<Module> getModules() {
        return modules;
    }
}
