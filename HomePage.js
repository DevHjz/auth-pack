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
import {Dimensions, InteractionManager, RefreshControl, TouchableOpacity, View} from "react-native";
import {Divider, IconButton, List, Modal, Portal, Text} from "react-native-paper";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import {CountdownCircleTimer} from "react-native-countdown-circle-timer";
import {useNetInfo} from "@react-native-community/netinfo";
import {FlashList} from "@shopify/flash-list";
import {useNotifications} from "react-native-notificated";
import {useTranslation} from "react-i18next";
import Animated, {
  useAnimatedStyle,
  withTiming
} from "react-native-reanimated";
import {MaterialCommunityIcons} from "@expo/vector-icons";
import {useNavigation} from "@react-navigation/native";

import SearchBar from "./SearchBar";
import EnterAccountDetails from "./EnterAccountDetails";
import ScanQRCode from "./ScanQRCode";
import EditAccountDetails from "./EditAccountDetails";
import AvatarWithFallback from "./AvatarWithFallback";
import {useImportManager} from "./ImportManager";
import useStore from "./useStorage";
import {useTokenRefresh, validateSecret} from "./totpUtil";
import {useAccountSync, useAccounts, useEditAccount} from "./useAccountStore";

const {width, height} = Dimensions.get("window");
const REFRESH_INTERVAL = 60000;
const OFFSET_X = width * 0.45;
const OFFSET_Y = height * 0.2;

function HomePage() {
  const [isPlusButton, setIsPlusButton] = useState(true);
  const [showOptions, setShowOptions] = useState(false);
  const [showEnterAccountModal, setShowEnterAccountModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredData, setFilteredData] = useState(accounts);
  const [showScanner, setShowScanner] = useState(false);
  const [showEditAccountModal, setShowEditAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [placeholder, setPlaceholder] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const {isConnected} = useNetInfo();
  const [canSync, setCanSync] = useState(false);
  // 新增：用 accountsVersion 替代原 key 状态，仅追踪账号数据变化
  const [accountsVersion, setAccountsVersion] = useState(0);
  const swipeableRef = useRef(null);
  const {userInfo, serverUrl, token} = useStore();
  const {startSync} = useAccountSync();
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

  // 优化：仅在 accounts 变化时更新过滤数据和版本号（触发列表重渲染）
  useEffect(() => {
    setFilteredData(accounts);
    setAccountsVersion(prev => prev + 1);
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
            title: "Sync error",
            description: syncError,
          },
        });
      } else {
        notify("success", {
          params: {
            title: "Sync success",
            description: "All your accounts are up to date.",
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


  const handleEditAccount = (account) => {
    closeSwipeableMenu();
    setEditingAccount(account);
    setPlaceholder(account.accountName);
    setShowEditAccountModal(true);
  };

  const onAccountEdit = async(newAccountName) => {
    if (editingAccount) {
      setAccount({...editingAccount, accountName: newAccountName, oldAccountName: editingAccount.accountName});
      updateAccount();
      setPlaceholder("");
      setEditingAccount(null);
      closeEditAccountModal();
    }
  };

  const onAccountDelete = async(account) => {
    deleteAccount(account.id);
  };

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


  const closeSwipeableMenu = () => {
    if (swipeableRef.current) {
      swipeableRef.current.close();
    }
  };

  const handleSearch = (query) => {
    setSearchQuery(query);
    setFilteredData(query.trim() !== ""
      ? accounts && accounts.filter(item => item.accountName.toLowerCase().includes(query.toLowerCase()))
      : accounts
    );
  };

  const renderRightActions = (progress, dragX, account, onEdit, onDelete) => {
    const styleAnimation = useAnimatedStyle(() => {
      return {
        transform: [{translateX: dragX.value + 160}],
      };
    });

    return (
      <Animated.View style={[{width: 160, flexDirection: "row"}, styleAnimation]}>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "#E6DFF3",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => {
            dragX.value = withTiming(0);
            onEdit(account);
          }}
        >
          <MaterialCommunityIcons name="pencil" size={24} color="#666" />
          <Text style={{marginTop: 4, color: "#666"}}>
            {t("common.edit")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "#FF6B6B",
            justifyContent: "center",
            alignItems: "center",
          }}
          onPress={() => {
            dragX.value = withTiming(0);
            onDelete(account);
          }}
        >

          <MaterialCommunityIcons name="trash-can" size={24} color="#FFF" />
          <Text style={{marginTop: 4, color: "#FFF"}}>
            {t("common.delete")}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const handleItemPress = (item) => {
    navigation.navigate("ItemDetailPage", {
      item: {
        ...item,
        changedAt: item.changedAt.toISOString(),
      },
    });
  };

  const ListItem = ({item, onPress}) => {
    const {token, timeRemaining} = useTokenRefresh(item.secretKey);

    return (
      <GestureHandlerRootView>
        <Swipeable
          ref={swipeableRef}
          renderRightActions={(progress, dragX) =>
            renderRightActions(progress, dragX, item, handleEditAccount, onAccountDelete)
          }
          rightThreshold={40}
          overshootRight={false}
          friction={2}
          enableTrackpadTwoFingerGesture
          onSwipeableOpen={() => {
            if (swipeableRef.current) {
              swipeableRef.current.close();
            }
          }}
        >
          <List.Item
            style={{
              height: 80,
              paddingVertical: 6,
              paddingHorizontal: 16,
              justifyContent: "center",
            }}
            title={
              <View style={{justifyContent: "center", paddingLeft: 0, paddingTop: 6}}>
                <Text variant="titleMedium" numberOfLines={1}>
                  {item.accountName}
                </Text>

                <Text variant="titleLarge" style={{fontWeight: "bold"}}>{token}</Text>
              </View>
            }
            left={() => (
              <AvatarWithFallback
                source={{uri: `https://cdn.casbin.org/img/social_${item.issuer?.toLowerCase()}.png`}}
                fallbackSource={{uri: "https://cdn.casbin.org/img/social_default.png"}}
                size={60}
                style={{
                  borderRadius: 10,
                  backgroundColor: "transparent",
                }}
              />
            )}
            right={() => (
              <View style={{justifyContent: "center", alignItems: "center"}}>
                <CountdownCircleTimer
                  // 移除：key={key} 避免倒计时触发重渲染
                  isPlaying={true}
                  duration={30}
                  initialRemainingTime={timeRemaining}
                  colors={["#004777", "#0072A0", "#0099CC", "#FF6600", "#CC3300", "#A30000"]}
                  colorsTime={[30, 24, 18, 12, 6, 0]}
                  size={60}
                  onComplete={() => {
                    // 移除：setKey(prevKey => prevKey + 1); 避免倒计时触发列表重渲染
                    return {
                      shouldRepeat: true,
                      delay: 0,
                      newInitialRemainingTime: timeRemaining,
                    };
                  }}
                  strokeWidth={5}
                >

                  {({remainingTime}) => (
                    <Text style={{fontSize: 18, fontWeight: "bold"}}>{remainingTime}s</Text>
                  )}
                </CountdownCircleTimer>
              </View>
            )}
            onPress={() => handleItemPress(item)}
          />
        </Swipeable>
      </GestureHandlerRootView>
    );
  };

  return (
    <View style={{flex: 1}}>
      <SearchBar onSearch={handleSearch} />
      <FlashList
        data={searchQuery.trim() !== "" ? filteredData : accounts}
        keyExtractor={(item) => `${item.id}`}
        extraData={accountsVersion} // 关键：仅在账号数据变化时更新
        estimatedItemSize={80}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({item}) => (
          <ListItem item={item} onPress={handleItemPress} />
        )}
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
            style={{
              height: 60,
              alignItems: "center",
              justifyContent: "center",
              borderBottomWidth: 1,
              borderBottomColor: "#eee",
            }}
            onPress={handleScanPress}
          >
            <MaterialCommunityIcons name="qrcode-scan" size={28} color="#8A7DF7" />
            <Text style={{marginTop: 4, fontSize: 16}}>{t("homepage.Scan QR code")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              height: 60,
              alignItems: "center",
              justifyContent: "center",
              borderBottomWidth: 1,
              borderBottomColor: "#eee",
            }}
            onPress={openEnterAccountModal}
          >
            <MaterialCommunityIcons name="plus-circle" size={28} color="#8A7DF7" />
            <Text style={{marginTop: 4, fontSize: 16}}>{t("homepage.Enter manually")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={{
              height: 60,
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={openImportAccountModal}
          >
            <MaterialCommunityIcons name="import" size={28} color="#8A7DF7" />
            <Text style={{marginTop: 4, fontSize: 16}}>{t("homepage.Import accounts")}</Text>
          </TouchableOpacity>
        </Modal>
      </Portal>

      <FAB
        icon={isPlusButton ? "plus" : "close"}
        style={styles.fab}
        onPress={togglePlusButton}
      />

      <Modal visible={showScanner} animationType="slide">
        <Scanner
          onDetected={handleAddAccount}
          onError={handleScanError}
          onClose={handleCloseScanner}
        />
      </Modal>

      <Modal visible={showEnterAccountModal} animationType="slide">
        <EnterAccountDetails
          onClose={closeEnterAccountModal}
          onAdd={handleAddAccount}
        />
      </Modal>

      <Modal visible={showEditAccountModal} animationType="slide">
        <EditAccountDetails
          onClose={closeEditAccountModal}
          onEdit={onAccountEdit}
          placeholder={placeholder}
        />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
    backgroundColor: "#8A7DF7",
  },
});

export default HomePage;
