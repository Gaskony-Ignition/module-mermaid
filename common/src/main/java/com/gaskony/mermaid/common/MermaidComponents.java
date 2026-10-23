package com.gaskony.mermaid.common;

import com.inductiveautomation.ignition.common.jsonschema.JsonSchema;
import com.inductiveautomation.perspective.common.api.BrowserResource;
import com.inductiveautomation.perspective.common.api.ComponentDescriptor;
import com.inductiveautomation.perspective.common.api.ComponentDescriptorImpl;

import javax.swing.ImageIcon;
import java.awt.image.BufferedImage;
import java.util.Set;

/**
 * Descriptor for the Mermaid Chart Perspective component, shared by the gateway and designer hooks.
 */
public final class MermaidComponents {
    public static final String MODULE_ID = "com.gaskony.mermaid";
    public static final String COMPONENT_ID = "gaskony.display.mermaid";
    public static final String MOUNT_ALIAS = "gaskony-mermaid";

    // The web-ui webpack publicPath is /res/gaskony-mermaid/; change both together.
    private static final Set<BrowserResource> BROWSER_RESOURCES = Set.of(
        new BrowserResource("gaskony-mermaid-js", "/res/" + MOUNT_ALIAS + "/MermaidChart.js",
            BrowserResource.ResourceType.JS),
        new BrowserResource("gaskony-mermaid-css", "/res/" + MOUNT_ALIAS + "/MermaidChart.css",
            BrowserResource.ResourceType.CSS)
    );

    public static final JsonSchema SCHEMA =
        JsonSchema.parse(MermaidComponents.class.getResourceAsStream("/mermaid.props.json"));

    // ImageIO and Graphics2D are avoided: ServiceLoader and headless AWT misbehave in module classloaders.
    private static final BufferedImage ICON = createIcon();

    public static final ComponentDescriptor DESCRIPTOR = ComponentDescriptorImpl.ComponentBuilder.newBuilder()
        .setPaletteCategory("Mermaid Chart")
        .setId(COMPONENT_ID)
        .setModuleId(MODULE_ID)
        .setSchema(SCHEMA)
        .setName("Mermaid Chart")
        .setIcon(new ImageIcon(ICON))
        .addPaletteEntry("", "Mermaid Chart", "Renders a Mermaid diagram definition as an SVG chart.", ICON, null)
        .setDefaultMetaName("MermaidChart")
        .setResources(BROWSER_RESOURCES)
        .build();

    private MermaidComponents() {
    }

    /** A 16x16 flowchart glyph: two boxes joined by a line to a third. */
    private static BufferedImage createIcon() {
        BufferedImage img = new BufferedImage(16, 16, BufferedImage.TYPE_INT_ARGB);
        int c = 0xFF89B4FA;
        int[][] boxes = {{1, 1, 6, 5}, {9, 1, 14, 5}, {5, 10, 10, 14}};
        for (int[] b : boxes) {
            for (int x = b[0]; x <= b[2]; x++) {
                img.setRGB(x, b[1], c);
                img.setRGB(x, b[3], c);
            }
            for (int y = b[1]; y <= b[3]; y++) {
                img.setRGB(b[0], y, c);
                img.setRGB(b[2], y, c);
            }
        }
        for (int y = 6; y <= 9; y++) {
            img.setRGB(3, y, c);
            img.setRGB(12, y, c);
        }
        for (int x = 3; x <= 12; x++) {
            img.setRGB(x, 8, c);
        }
        return img;
    }
}
