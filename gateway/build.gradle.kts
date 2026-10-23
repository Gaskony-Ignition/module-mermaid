plugins {
    `java-library`
}

java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(17))
    }
}

dependencies {
    implementation(projects.common)
    compileOnly(libs.ignition.common)
    compileOnly(libs.ignition.gateway.api)
    compileOnly(libs.perspective.common)
    compileOnly(libs.perspective.gateway)
}

// The webpack output lands in gateway.jar under mounted/, which the hook serves at /res/gaskony-mermaid/.
sourceSets {
    main {
        resources {
            srcDir(project(":web-ui").layout.buildDirectory.dir("generated-resources"))
        }
    }
}

tasks.named<ProcessResources>("processResources") {
    dependsOn(":web-ui:webpack")
}
