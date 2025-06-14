package com.rftrec.framework;

public abstract class Module {
    private final String name;
    private boolean toggled;

    protected Module(String name) {
        this.name = name;
    }

    public String getName() {
        return name;
    }

    public boolean isToggled() {
        return toggled;
    }

    public void toggle() {
        toggled = !toggled;
        if (toggled) {
            onEnable();
        } else {
            onDisable();
        }
    }

    protected void onEnable() {}
    protected void onDisable() {}
}
