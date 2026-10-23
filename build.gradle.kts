plugins {
    base
    id("io.ia.sdk.modl") version "0.5.0"
}

version = "0.3.2"
group = "com.gaskony"

allprojects {
    version = rootProject.version
    group = "com.gaskony"
}

// Signing is skipped when the keystore named in the untracked gradle.properties is absent.
val keystoreFilePath = (findProperty("ignition.signing.keystoreFile") as? String) ?: ""
val signingSkipped = keystoreFilePath.isBlank() || !file(keystoreFilePath).exists()

ignitionModule {
    fileName.set("MermaidChart-${project.version}")
    name.set("Mermaid Chart")
    id.set("com.gaskony.mermaid")
    moduleVersion.set(project.version.toString())
    moduleDescription.set("A Perspective component that renders Mermaid diagram definitions as SVG, fully offline")
    requiredIgnitionVersion.set("8.3.0")
    freeModule.set(true)
    license.set("license.html")

    projectScopes.putAll(mapOf(
        ":gateway" to "G",
        ":designer" to "D",
        ":common" to "GD"
    ))

    hooks.putAll(mapOf(
        "com.gaskony.mermaid.gateway.MermaidGatewayHook" to "G",
        "com.gaskony.mermaid.designer.DesignerHook" to "D"
    ))

    moduleDependencySpecs {
        register("com.inductiveautomation.perspective") {
            scope = "GD"
            required = true
        }
    }

    skipModlSigning.set(signingSkipped)
}

tasks.register("syncVersion") {
    group = "versioning"
    description = "Syncs project.version into web-ui/package.json and the README"
    doLast {
        val ver = project.version.toString()
        fun sync(f: File, pattern: Regex, replacement: String) {
            if (!f.exists()) return
            val text = f.readText()
            val updated = text.replaceFirst(pattern, replacement)
            if (updated != text) { f.writeText(updated); logger.lifecycle("  synced ${f.name} -> $ver") }
        }
        sync(file("web-ui/package.json"), Regex(""""version":\s*"[^"]+""""), """"version": "$ver"""")
        sync(file("README.md"), Regex("""MermaidChart-[\d.]+\.modl"""), "MermaidChart-${ver}.modl")
    }
}

tasks.named("assembleModlStructure") {
    dependsOn("syncVersion")
}

// A green build is not proof of a correct package: assert what is inside the signed .modl.
val verifyModulePackaging by tasks.registering {
    description = "Fails the build if the signed .modl lacks the component bundle or carries stale jars"
    group = "verification"
    dependsOn("signModule")

    doLast {
        val modl = layout.buildDirectory.file("MermaidChart-${project.version}.modl").get().asFile
        if (!modl.exists()) throw GradleException("verifyModulePackaging: ${modl.name} not found")

        val entries = mutableListOf<String>()
        java.util.zip.ZipFile(modl).use { zip ->
            zip.entries().asSequence().forEach { e ->
                entries += e.name
                if (e.name.startsWith("gateway-") && e.name.endsWith(".jar")) {
                    java.util.zip.ZipInputStream(zip.getInputStream(e)).use { inner ->
                        generateSequence { inner.nextEntry }.forEach { entries += "gateway.jar!/" + it.name }
                    }
                }
            }
        }

        val problems = mutableListOf<String>()
        listOf("gateway.jar!/mounted/MermaidChart.js", "gateway.jar!/mounted/MermaidChart.css").forEach {
            if (it !in entries) problems += "missing $it"
        }
        if (entries.none { it.startsWith("gateway.jar!/mounted/") && it.contains("mermaid") && it != "gateway.jar!/mounted/MermaidChart.js" }) {
            problems += "no mermaid diagram chunks under mounted/"
        }
        // An incremental build after a version bump keeps the old version's jars in moduleContent.
        entries.filter { Regex("""^(gateway|common|designer)-.*\.jar$""").matches(it) && !it.contains("-${project.version}.jar") }
            .forEach { problems += "stale jar from another version: $it" }
        if (!signingSkipped) {
            listOf("certificates.p7b", "signatures.properties").forEach { if (it !in entries) problems += "unsigned: no $it" }
        }

        if (problems.isNotEmpty()) {
            throw GradleException("verifyModulePackaging FAILED for ${modl.name}:\n  " + problems.joinToString("\n  "))
        }
        logger.lifecycle("verifyModulePackaging: ${modl.name} OK (${entries.size} entries)")
    }
}

tasks.named("build") {
    dependsOn(verifyModulePackaging)
}
