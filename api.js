// Copyright 2024 The Casdoor Authors. All Rights Reserved.
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

import i18next from "i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {createServerApiUrl} from "./serverUrl";

const TIMEOUT_MS = 5000;

const fetchWithTimeout = async(url, options = {}, timeoutMs = TIMEOUT_MS) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const defaultHeaders = {
      "Accept-Language": (await AsyncStorage.getItem("language")) || "en",
      "Content-Type": "application/json",
    };

    const {token, ...fetchOptions} = options;
    if (token) {
      defaultHeaders.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers: {
        ...defaultHeaders,
        ...fetchOptions.headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("Authentication server returned an invalid response.");
    }

    const result = await response.json();
    if (!result || typeof result !== "object") {
      throw new Error("Authentication server returned an invalid response.");
    }
    if (result.status === "error") {
      throw new Error(result.msg || "Authentication server returned an error.");
    }

    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(i18next.t("api.Request timed out"));
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

const getUserApiUrl = (serverUrl, owner, name) => {
  const userId = `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  return createServerApiUrl(serverUrl, `/api/get-user?id=${userId}`);
};

export const getMfaAccounts = async(serverUrl, owner, name, token, timeoutMs = TIMEOUT_MS) => {
  const res = await fetchWithTimeout(
    getUserApiUrl(serverUrl, owner, name),
    {
      method: "GET",
      token,
    },
    timeoutMs
  );

  return {
    updatedTime: res.data?.updatedTime,
    mfaAccounts: Array.isArray(res.data?.mfaAccounts) ? res.data.mfaAccounts : [],
  };
};

export const updateMfaAccounts = async(serverUrl, owner, name, newMfaAccounts, token, timeoutMs = TIMEOUT_MS) => {
  const userData = await fetchWithTimeout(
    getUserApiUrl(serverUrl, owner, name),
    {
      method: "GET",
      token,
    },
    timeoutMs
  );

  if (!userData.data || typeof userData.data !== "object") {
    throw new Error("Authentication server returned an invalid user response.");
  }

  userData.data.mfaAccounts = newMfaAccounts;
  const res = await fetchWithTimeout(
    createServerApiUrl(serverUrl, `/api/update-user?id=${encodeURIComponent(owner)}/${encodeURIComponent(name)}`),
    {
      method: "POST",
      token,
      body: JSON.stringify(userData.data),
    },
    timeoutMs
  );

  return {status: res.status, data: res.data};
};

export const validateToken = async(serverUrl, token, timeoutMs = TIMEOUT_MS) => {
  if (!token) {
    return false;
  }

  const res = await fetchWithTimeout(
    createServerApiUrl(serverUrl, "/api/userinfo"),
    {
      method: "GET",
      token,
    },
    timeoutMs
  );

  if (!res.sub || !res.name || !res.preferred_username) {
    throw new Error("Authentication server rejected the access token.");
  }

  return true;
};
