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

import React, {useCallback, useEffect, useRef, useState} from "react";
import {Dimensions, InteractionManager, RefreshControl, TouchableOpacity, View} from "react-native";
import {Divider, IconButton, Modal, Portal, Text} from "react-native-paper";
import {useNetInfo} from "@react-native-community/netinfo";
import {FlashList} from "@shopify/flash-list";
import {useNotifications} from "react-native-notificated";
import {useTranslation} from "react-i18next";
import {useNavigation} from "@react-navigation/native";

import SearchBar from "./SearchBar";
import EnterAccountDetails from "./EnterAccountDetails";
import ScanQRCode from "./ScanQRCode";
import EditAccountDetails from "./EditAccountDetails";
import HomeListItem from "./HomeListItem";
import {useImportManager} from "./ImportManager";
import useStore from "./useStorage";
import {validateSecret} from "./totpUtil";
import {useAccounts, useEditAccount, useStartAccountSync} from "./useAccountStore";
import {completeWebLogin} from "./webLogin";

const {width, height} = Dimensions.get("window");
const REFRESH_INTERVAL = 300000;
const OFFSET_X = width * 0.45;
const OFFSET_Y = height * 0.2;

export default function HomePage() {
  const [isPlusButton, setIsPlusButton] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showEnterAccountModal, setShowEnterAccountModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredData, setFilteredData] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [placeholder, setPlaceholder] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const {isConnected} = useNetInfo();
  const [canSync, setCanSync] = useState(false);
  const swipeableRef = useRef(null);
  const {userInfo, serverUrl, token} = useStore();
  const startSync = useStartAccountSync();
  const {accounts} = useAccounts();
  const {setAccount, updateAccount, insertAccount, insertAccounts, deleteAccount} = useEditAccount();
  const {notify} = useNotifications();
  const {t} = useTranslation();
  const {showImportOptions} = useImportManager((data) => {
    handleAddAccount(data);
  }, (err) => {
    notify("error", {
      params: {
        title: t("homepage.Import error"),
        description: err.message,
      },
    });
  }, () => {
    setShowScanner(true);
  });
  const navigation = useNavigation();

  useEffect(() => {
    setCanSync(Boolean(isConnected && userInfo && serverUrl));
  }, [isConnected, userInfo, serverUrl]);

  // on the web, finish the login when Casdoor redirects back to the app
  useEffect(() => {
    const finishWebLogin = async() => {
      // the persisted store loads asynchronously and would overwrite a token set before it
      if (!useStore.persist.hasHydrated()) {
        await new Promise((resolve) => useStore.persist.onFinishHydration(resolve));
      }
      const result = await completeWebLogin();
      if (result) {
        const {setCasdoorConfig, setToken, setUserInfo} = useStore.getState();
        setCasdoorConfig(result.config);
        setToken(result.token);
        setUserInfo(result.userInfo);
        notify("success", {
          params: {title: t("common.success"), description: t("casdoorLoginPage.Logged in successfully!")},
        });
      }
    };
    finishWebLogin().catch((error) => {
      notify("error", {params: {title: t("common.error"), description: error.message}});
    });
  }, []);

  useEffect(() => {
    setFilteredData(accounts);
  }, [accounts]);

  useEffect(() => {
    if (canSync) {
      startSync(userInfo, serverUrl, token);

      const timer = setInterval(() => {
        InteractionManager.runAfterInteractions(() => {
          startSync(userInfo, serverUrl, token);
        });
      }, REFRESH_INTERVAL);

      return () => clearInterval(timer);
    }
  }, [startSync, canSync, token]);

  const onRefresh = async() => {
    setRefreshing(true);
    if (canSync) {
      const syncError = await startSync(userInfo, serverUrl, token);
      if (syncError) {
        notify("error", {
          params: {
            title: t("syncLogic.Sync failed"),
            description: syncError,
          },
        });
      } else {
        notify("success", {
          params: {
            title: t("syncLogic.Sync success"),
            description: t("syncLogic.All your accounts are up to date."),
          },
        });
      }
    }
    setRefreshing(false);
  };

  const handleAddAccount = async(accountDataInput) => {
    if (Array.isArray(accountDataInput)) {
      await insertAccounts(accountDataInput);
    } else {
      await setAccount(accountDataInput);
      await insertAccount();
      closeEnterAccountModal();
    }
  };

  const handleEditAccount = useCallback((account) => {
    if (swipeableRef.current) {
      swipeableRef.current.close();
    }
    setEditingAccount(account);
    setPlaceholder(account.accountName);
    setShowEditAccountModal(true);
  }, [swipeableRef]);

  const onAccountEdit = async(newAccountName) => {
    if (editingAccount) {
      setAccount({...editingAccount, accountName: newAccountName, oldAccountName: editingAccount.accountName});
      updateAccount();
      setPlaceholder("");
      setEditingAccount(null);
      closeEditAccountModal();
    }
  };

  const onAccountDelete = useCallback((account) => {
    deleteAccount(account.id);
  }, [deleteAccount]);

  const closeEditAccountModal = () => setShowEditAccountModal(false);

  const handleScanPress = () => {
    setShowScanner(true);
    setIsPlusButton(true);
    setShowOptions(false);
  };

  const handleCloseScanner = () => setShowScanner(false);

  const handleScanError = (error) => {
    setShowScanner(false);
    notify("error", {
      params: {
        title: t("homepage.Error scanning QR code"),
        description: error,
      },
    });
  };

  const togglePlusButton = () => {
    setIsPlusButton(!isPlusButton);
    setShowOptions(!showOptions);
  };

  const closeOptions = () => {
    setIsPlusButton(true);
    setShowOptions(false);
    setShowScanner(false);
  };

  const openEnterAccountModal = () => {
    setShowEnterAccountModal(true);
    closeOptions();
  };

  const openImportAccountModal = () => {
    showImportOptions();
    closeOptions();
  };

  const closeEnterAccountModal = () => setShowEnterAccountModal(false);

  const handleSearch = (query) => {
    setSearchQuery(query);
    setFilteredData(query.trim() !== ""
      ? accounts && accounts.filter(item => item.accountName.toLowerCase().includes(query.toLowerCase()))
      : accounts
    );
  };

  const handleItemPress = useCallback((item) => {
    navigation.navigate("ItemDetailPage", {
      item: {
        ...item,
        changedAt: item.changedAt.toISOString(),
      },
    });
  }, [navigation]);

  const renderListItem = useCallback(({item}) => (
    <HomeListItem
      item={item}
      onPress={handleItemPress}
      onEdit={handleEditAccount}
      onDelete={onAccountDelete}
      swipeableRef={swipeableRef}
      t={t}
    />
  ), [handleEditAccount, handleItemPress, onAccountDelete, swipeableRef, t]);

  return (
    <View style={{flex: 1}}>
      <SearchBar onSearch={handleSearch} />
      <FlashList
        data={searchQuery.trim() !== "" ? filteredData : accounts}
        keyExtractor={(item) => `${item.id}`}
        estimatedItemSize={80}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={renderListItem}
        ItemSeparatorComponent={() => <Divider />}
      />

      <Portal>
        <Modal
          visible={showOptions}
          onDismiss={closeOptions}
          contentContainerStyle={{
            backgroundColor: "white",
            padding: 20,
            borderRadius: 10,
            width: 300,
            height: 225,
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: [{translateX: -150}, {translateY: -112.5}],
          }}
        >
          <TouchableOpacity
            style={{flexDirection: "row", alignItems: "center"}}
            onPress={handleScanPress}
          >
            <IconButton icon={"camera"} size={35} />
            <View style={{width: 180}}>
              <Text style={{fontSize: 18}}>{t("homepage.Scan QR Code")}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={{flexDirection: "row", alignItems: "center", marginTop: 10}}
            onPress={openEnterAccountModal}
          >
            <IconButton icon={"keyboard"} size={35} />
            <View style={{width: 180}}>
              <Text style={{fontSize: 18}}>{t("homepage.Enter Secret Code")}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={{flexDirection: "row", alignItems: "center", marginTop: 10}}
            onPress={openImportAccountModal}
          >
            <IconButton icon={"import"} size={35} />
            <View style={{width: 180}}>
              <Text style={{fontSize: 18}}>{t("homepage.Import from other app")}</Text>
            </View>
          </TouchableOpacity>
        </Modal>
      </Portal>

      <Portal>
        <Modal
          visible={showEnterAccountModal}
          onDismiss={closeEnterAccountModal}
          contentContainerStyle={{
            backgroundColor: "white",
            padding: 1,
            borderRadius: 10,
            width: "90%",
            height: "40%",
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: [{translateX: -OFFSET_X}, {translateY: -OFFSET_Y}],
          }}
        >
          <EnterAccountDetails onClose={closeEnterAccountModal} onAdd={handleAddAccount} validateSecret={validateSecret} />
        </Modal>
      </Portal>

      <Portal>
        <Modal
          visible={showEditAccountModal}
          onDismiss={closeEditAccountModal}
          contentContainerStyle={{
            backgroundColor: "white",
            padding: 1,
            borderRadius: 10,
            width: "90%",
            height: "30%",
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: [{translateX: -OFFSET_X}, {translateY: -OFFSET_Y}],
          }}
        >
          <EditAccountDetails onClose={closeEditAccountModal} onEdit={onAccountEdit} placeholder={placeholder} />
        </Modal>
      </Portal>

      {showScanner && (
        <ScanQRCode onClose={handleCloseScanner} showScanner={showScanner} onAdd={handleAddAccount} onError={handleScanError} />
      )}

      <TouchableOpacity
        style={{
          position: "absolute",
          bottom: 30,
          right: 30,
          width: 70,
          height: 70,
          borderRadius: 35,
          backgroundColor: "#E6DFF3",
          alignItems: "center",
          justifyContent: "center",
        }}
        onPress={togglePlusButton}
      >
        <IconButton icon={isPlusButton ? "plus" : "close"} size={40} color={"white"} />
      </TouchableOpacity>
    </View>
  );
}
