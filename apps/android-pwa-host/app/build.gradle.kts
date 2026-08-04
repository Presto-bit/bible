plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

import java.util.Properties
import java.io.FileInputStream

val keystorePropertiesFile = rootProject.file("keystore/keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    namespace = "cn.prestoai.peiai"
    compileSdk = 34

    defaultConfig {
        applicationId = "cn.prestoai.peiai"
        minSdk = 26
        targetSdk = 34
        // 2.x = Chrome-hosted PWA 容器（非 System WebView）
        versionCode = 20
        versionName = "2.0.0"
        manifestPlaceholders["hostName"] = "2sc.prestoai.cn"
        manifestPlaceholders["defaultUrl"] = "https://2sc.prestoai.cn/"
        buildConfigField("String", "HOST", "\"2sc.prestoai.cn\"")
        buildConfigField("String", "DEFAULT_URL", "\"https://2sc.prestoai.cn/\"")
        buildConfigField("String", "HOST_MARKER", "\"chrome\"")
    }

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = rootProject.file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.browser:browser:1.8.0")
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
