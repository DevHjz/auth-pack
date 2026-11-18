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

import totp from "totp-generator";
import {useMemo, useSyncExternalStore} from "react";

let clockSeconds = Math.floor(Date.now() / 1000);
let clockTimeout = null;
const clockSubscribers = new Set();

const getClockSnapshot = () => clockSeconds;

const scheduleClockTick = () => {
  if (clockTimeout !== null || clockSubscribers.size === 0) {
    return;
  }

  const delay = 1000 - (Date.now() % 1000);
  clockTimeout = setTimeout(() => {
    clockTimeout = null;
    const nextClockSeconds = Math.floor(Date.now() / 1000);
    if (nextClockSeconds !== clockSeconds) {
      clockSeconds = nextClockSeconds;
      [...clockSubscribers].forEach(listener => listener());
    }
    scheduleClockTick();
  }, delay || 1000);
};

const subscribeToClock = (listener) => {
  clockSubscribers.add(listener);
  if (clockSubscribers.size === 1) {
    clockSeconds = Math.floor(Date.now() / 1000);
    scheduleClockTick();
  }

  return () => {
    clockSubscribers.delete(listener);
    if (clockSubscribers.size === 0 && clockTimeout !== null) {
      clearTimeout(clockTimeout);
      clockTimeout = null;
    }
  };
};

export function calculateCountdown(period = 30, now = Date.now()) {
  const nowSeconds = now / 1000;
  const nextPeriod = (Math.floor(nowSeconds / period) + 1) * period;
  return Math.max(0, Math.ceil(nextPeriod - nowSeconds));
}

export function validateSecret(secret) {
  const base32Regex = /^[A-Z2-7]+=*$/i;
  if (!secret || secret.length % 8 !== 0) {
    return false;
  }
  return base32Regex.test(secret);
}

export function generateToken(secret) {
  if (secret !== null && secret !== undefined && secret !== "") {
    try {
      const token = totp(secret);
      const tokenWithSpace = token.slice(0, 3) + " " + token.slice(3);
      return tokenWithSpace;
    } catch (error) {
      return "Secret Invalid";
    }
  } else {
    return "Secret Empty";
  }
}

export function useTokenRefresh(secretKey, period = 30) {
  const nowSeconds = useSyncExternalStore(subscribeToClock, getClockSnapshot, getClockSnapshot);
  const periodIndex = Math.floor(nowSeconds / period);
  const token = useMemo(() => generateToken(secretKey), [secretKey, periodIndex]);
  const timeRemaining = calculateCountdown(period, nowSeconds * 1000);

  return {token, timeRemaining, periodIndex};
}
