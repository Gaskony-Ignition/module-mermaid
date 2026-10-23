package com.gaskony.mermaid.designer;

import com.gaskony.mermaid.common.MermaidComponents;
import com.inductiveautomation.ignition.common.licensing.LicenseState;
import com.inductiveautomation.ignition.designer.model.AbstractDesignerModuleHook;
import com.inductiveautomation.ignition.designer.model.DesignerContext;
import com.inductiveautomation.perspective.designer.DesignerComponentRegistry;
import com.inductiveautomation.perspective.designer.api.PerspectiveDesignerInterface;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Designer hook: puts the Mermaid Chart component in the Perspective palette.
 */
public class DesignerHook extends AbstractDesignerModuleHook {

    private static final Logger logger = LoggerFactory.getLogger(DesignerHook.class);

    private DesignerComponentRegistry registry;

    @Override
    public void startup(DesignerContext context, LicenseState activationState) throws Exception {
        super.startup(context, activationState);
        registry = PerspectiveDesignerInterface.get(context).getDesignerComponentRegistry();
        registry.registerComponent(MermaidComponents.DESCRIPTOR);
        logger.info("Registered Perspective component {} in the Designer", MermaidComponents.COMPONENT_ID);
    }

    @Override
    public void shutdown() {
        if (registry != null) {
            registry.removeComponent(MermaidComponents.COMPONENT_ID);
        }
        super.shutdown();
    }
}
