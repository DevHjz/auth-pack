// Copyright 2023 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, {useEffect, useRef, useState} from "react";
import {WebView} from "react-native-webview";
import {Platform, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity} from "react-native";
import {Portal} from "react-native-paper";
import {useNotifications} from "react-native-notificated";
import SDK from "casdoor-react-native-sdk";
import PropTypes from "prop-types";
import EnterCasdoorSdkConfig from "./EnterCasdoorSdkConfig";
import ScanQRCodeForLogin from "./ScanLogin";
import useStore from "./useStorage";
import {getTenantConfig} from "./TenantConfigs";
import {useTranslation} from "react-i18next";
import {useLanguageSync} from "./useLanguageSync";
import {useEditAccount} from "./useAccountStore";
import * as api from "./api";

function CasdoorLoginPage({onWebviewClose, initialMethod}) {
  CasdoorLoginPage.propTypes = {
    onWebviewClose: PropTypes.func.isRequired,
    initialMethod: PropTypes.oneOf(["cloud", "publicIam", "manual", "scan"]).isRequired,
  };

  useLanguageSync();
  const {notify} = useNotifications();
  const {t} = useTranslation();
  const tenantConfig = getTenantConfig(initialMethod);
  const [casdoorLoginURL, setCasdoorLoginURL] = useState("");
  const [currentView, setCurrentView] = useState(
    initialMethod === "scan" ? "scanner" : tenantConfig ? "webview" : "config"
  );
  const sdkRef = useRef(null);
  const sdkConfigRef = useRef(null);

  const {
    serverUrl,
    clientId,
    redirectPath,
    appName,
    organizationName,
    getCasdoorConfig,
    setCasdoorConfig,
    setUserInfo,
    setToken,
  } = useStore();

  const initSdk = (config) => {
    const sdkConfig = config || (
      initialMethod === "manual" && serverUrl && clientId && redirectPath && appName && organizationName
        ? getCasdoorConfig()
        : null
    );

    sdkConfigRef.current = sdkConfig;
    sdkRef.current = sdkConfig ? new SDK(sdkConfig) : null;
    return sdkRef.current;
  };

  const getCasdoorSignInUrl = async(config) => {
    const sdk = initSdk(config);
    if (!sdk) {
      notify("error", {
        params: {
          title: t("common.error"),
          description: t("enterCasdoorSDKConfig.Please fill in all the fields!"),
        },
      });
      return;
    }

    try {
      const signinUrl = await sdk.getSigninUrl();
      setCasdoorLoginURL(signinUrl);
    } catch (error) {
      notify("error", {
        params: {
          title: t("common.error"),
          description: error.message,
        },
      });
      setCurrentView("config");
    }
  };

  useEffect(() => {
    if (tenantConfig) {
      getCasdoorSignInUrl(tenantConfig);
    }
  }, [initialMethod]);

  const handleLogin = (method) => {
    if (method === "scan") {
      setCurrentView("scanner");
      return;
    }

    getCasdoorSignInUrl();
    setCurrentView("webview");
  };

  const handleAuthenticationRedirect = async(url) => {
    const sdk = sdkRef.current;
    const config = sdkConfigRef.current;
    if (!sdk || !config) {
      return;
    }

    try {
      const accessToken = await sdk.getAccessToken(url);
      await api.validateToken(config.serverUrl, accessToken);
      const userInfo = sdk.JwtDecode(accessToken);
      setCasdoorConfig(config);
      setToken(accessToken);
      setUserInfo(userInfo);
      onWebviewClose();
    } catch (error) {
      notify("error", {
        params: {
          title: t("common.error"),
          description: error.message,
        },
      });
      setCurrentView(tenantConfig ? "webview" : "config");
    }
  };

  const handleQRLogin = async(loginInfo) => {
    const config = {
      ...getCasdoorConfig(),
      serverUrl: loginInfo.serverUrl,
      clientId: "",
      appName: "",
      organizationName: "",
    };

    try {
      const sdk = initSdk(config);
      await api.validateToken(config.serverUrl, loginInfo.accessToken);
      const userInfo = sdk.JwtDecode(loginInfo.accessToken);
      setCasdoorConfig(config);
      setToken(loginInfo.accessToken);
      setUserInfo(userInfo);

      notify("success", {
        params: {
          title: t("common.success"),
          description: t("casdoorLoginPage.Logged in successfully!"),
        },
      });
      onWebviewClose();
    } catch (error) {
      notify("error", {
        params: {
          title: t("common.error"),
          description: error.message,
        },
      });
    }
  };

  const renderContent = () => {
    const views = {
      config: (
        <EnterCasdoorSdkConfig
          onClose={() => handleLogin("manual")}
          onWebviewClose={onWebviewClose}
          usePortal={false}
        />
      ),
      scanner: (
        <ScanQRCodeForLogin
          showScanner={true}
          onClose={() => {
            setCurrentView(tenantConfig ? "webview" : "config");
          }}
          onLogin={handleQRLogin}
          onError={(message) => {
            notify("error", {params: {title: t("common.error"), description: message}});
          }}
        />
      ),
      webview: casdoorLoginURL && (
        <SafeAreaView style={styles.safeArea}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => tenantConfig ? onWebviewClose() : setCurrentView("config")}
          >
            <Text style={styles.backButtonText}>{t("casdoorLoginPage.Back to Config")}</Text>
          </TouchableOpacity>
          <WebView
            source={{uri: casdoorLoginURL}}
            onShouldStartLoadWithRequest={(request) => {
              if (request.url.startsWith(redirectPath)) {
                handleAuthenticationRedirect(request.url);
                return false;
              }
              return true;
            }}
            onError={({nativeEvent}) => {
              notify("error", {
                params: {
                  title: t("common.error"),
                  description: nativeEvent.description,
                },
              });
              setCurrentView(tenantConfig ? "webview" : "config");
            }}
            style={styles.webview}
            mixedContentMode="never"
            javaScriptEnabled={true}
          />
        </SafeAreaView>
      ),
    };

    return views[currentView] || null;
  };

  return <Portal>{renderContent()}</Portal>;
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
  backButton: {
    padding: 10,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  backButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  safeArea: {
    flex: 1,
    backgroundColor: "white",
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
});

export const useCasdoorLogout = () => {
  const {deleteAccountByOrigin} = useEditAccount();

  const logout = async() => {
    await deleteAccountByOrigin();
  };

  return logout;
};

export default CasdoorLoginPage;
