import com.android.build.gradle.BaseExtension

allprojects {
    repositories {
        // 优先本地：本机 dl.google.com TLS 失败时，io.flutter 走已缓存 mavenLocal/.local-maven
        mavenLocal()
        maven { url = uri("${rootProject.projectDir}/.local-maven") }
        maven {
            url = uri("https://storage.flutter-io.cn/download.flutter.io")
            content { includeGroup("io.flutter") }
        }
        maven {
            url = uri("https://storage.googleapis.com/download.flutter.io")
            content { includeGroup("io.flutter") }
        }
        maven { url = uri("https://maven.aliyun.com/repository/google") }
        maven { url = uri("https://maven.aliyun.com/repository/central") }
        maven { url = uri("https://maven.aliyun.com/repository/public") }
        google()
        mavenCentral()
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}

/** 强制子模块 compileSdk，避免插件仍钉 35 时撞本机坏/缺 platforms;android-35 */
val peiaiCompileSdk = 36
val peiaiNdk = "28.2.13676358"

fun Project.applyPeiaiAndroidSdk() {
    extensions.findByType(BaseExtension::class.java)?.apply {
        compileSdkVersion(peiaiCompileSdk)
        ndkVersion = peiaiNdk
    }
}

subprojects {
    plugins.withId("com.android.library") { applyPeiaiAndroidSdk() }
    plugins.withId("com.android.application") { applyPeiaiAndroidSdk() }
    // 插件可能在 apply 之后才写 compileSdk=35；evaluation 后再盖一次
    afterEvaluate { applyPeiaiAndroidSdk() }
}

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
