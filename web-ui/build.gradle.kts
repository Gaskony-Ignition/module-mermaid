plugins {
    base
}

val isWindows = System.getProperty("os.name").lowercase().contains("windows")
fun npm(vararg args: String): List<String> =
    if (isWindows) listOf("cmd", "/c", "npm", *args) else listOf("npm", *args)

val npmInstall = tasks.register<Exec>("npmInstall") {
    group = "build"
    description = "Installs the locked npm dependencies"
    workingDir = projectDir
    commandLine = npm("ci")
    inputs.files("package.json", "package-lock.json")
    outputs.dir("node_modules")
}

val webpack = tasks.register<Exec>("webpack") {
    group = "build"
    description = "Type-checks and bundles the Perspective component"
    workingDir = projectDir
    commandLine = npm("run", "build")
    dependsOn(npmInstall)
    inputs.dir("src")
    inputs.dir("scripts")
    inputs.files("package.json", "package-lock.json", "tsconfig.json", "webpack.config.js")
    outputs.dir(layout.buildDirectory.dir("generated-resources"))
}

val frontendTest = tasks.register<Exec>("frontendTest") {
    group = "verification"
    description = "Runs the Vitest unit tests"
    workingDir = projectDir
    commandLine = npm("test")
    dependsOn(npmInstall)
}

tasks.named("check") {
    dependsOn(frontendTest)
}
