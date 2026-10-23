package com.gaskony.mermaid.gateway;

import com.gaskony.mermaid.common.MermaidComponents;
import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.gateway.model.AbstractGatewayModuleHook;
import com.inductiveautomation.ignition.gateway.model.GatewayContext;
import com.inductiveautomation.perspective.common.api.ComponentRegistry;
import com.inductiveautomation.perspective.gateway.api.PerspectiveContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Optional;

/**
 * Gateway hook: registers the Mermaid Chart component and serves its browser bundle.
 */
public class MermaidGatewayHook extends AbstractGatewayModuleHook {

    private static final Logger logger = LoggerFactory.getLogger(MermaidGatewayHook.class);

    private GatewayContext context;
    private ComponentRegistry registry;

    @Override
    public void setup(GatewayContext gatewayContext) {
        this.context = gatewayContext;
    }

    @Override
    public void startup(LicenseState activationState) {
        registry = PerspectiveContext.get(context).getComponentRegistry();
        registry.registerComponent(MermaidComponents.DESCRIPTOR);
        logger.info("Registered Perspective component {}", MermaidComponents.COMPONENT_ID);
    }

    @Override
    public void shutdown() {
        if (registry != null) {
            registry.removeComponent(MermaidComponents.COMPONENT_ID);
        }
    }

    @Override
    public Optional<String> getMountedResourceFolder() {
        return Optional.of("mounted");
    }

    @Override
    public Optional<String> getMountPathAlias() {
        return Optional.of(MermaidComponents.MOUNT_ALIAS);
    }

    @Override
    public boolean isFreeModule() {
        return true;
    }

    // Defaults to false: without it Maker Edition refuses to start the module.
    @Override
    public boolean isMakerEditionCompatible() {
        return true;
    }
}
