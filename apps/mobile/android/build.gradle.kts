import com.android.build.gradle.BaseExtension

allprojects {
    repositories {
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

val peiaiCompileSdk = 36
val peiaiNdk = "28.2.13676358"

subprojects {
    plugins.withId("com.android.library") {
        extensions.configure<BaseExtension>("android") {
            compileSdkVersion(peiaiCompileSdk)
            ndkVersion = peiaiNdk
        }
    }
    plugins.withId("com.android.application") {
        extensions.configure<BaseExtension>("android") {
            compileSdkVersion(peiaiCompileSdk)
            ndkVersion = peiaiNdk
        }
    }
}

subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
