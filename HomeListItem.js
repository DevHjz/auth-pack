// Copyright 2026 The Casdoor Authors. All Rights Reserved.
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

import React from "react";
import {TouchableOpacity, View} from "react-native";
import {GestureHandlerRootView} from "react-native-gesture-handler";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import {CountdownCircleTimer} from "react-native-countdown-circle-timer";
import {List, Text} from "react-native-paper";
import Animated, {
  useAnimatedStyle,
  withTiming
} from "react-native-reanimated";
import {MaterialCommunityIcons} from "@expo/vector-icons";

import AvatarWithFallback from "./AvatarWithFallback";
import {useTokenRefresh} from "./totpUtil";

const ListItemActions = ({dragX, item, onEdit, onDelete, t}) => {
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
          onEdit(item);
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
          onDelete(item);
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

const HomeListItem = ({item, onPress, onEdit, onDelete, swipeableRef, t}) => {
  const {token, timeRemaining, periodIndex} = useTokenRefresh(item.secretKey);

  return (
    <GestureHandlerRootView>
      <Swipeable
        ref={swipeableRef}
        renderRightActions={(_, dragX) => (
          <ListItemActions
            dragX={dragX}
            item={item}
            onEdit={onEdit}
            onDelete={onDelete}
            t={t}
          />
        )}
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
              key={item.issuer?.toLowerCase() ?? "__no_issuer__"}
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
                key={periodIndex}
                isPlaying={true}
                duration={30}
                initialRemainingTime={timeRemaining}
                colors={["#004777", "#0072A0", "#0099CC", "#FF6600", "#CC3300", "#A30000"]}
                colorsTime={[30, 24, 18, 12, 6, 0]}
                size={60}
                strokeWidth={5}
              >
                {() => (
                  <Text style={{fontSize: 18, fontWeight: "bold"}}>{timeRemaining}s</Text>
                )}
              </CountdownCircleTimer>
            </View>
          )}
          onPress={() => onPress(item)}
        />
      </Swipeable>
    </GestureHandlerRootView>
  );
};

export default React.memo(HomeListItem);
