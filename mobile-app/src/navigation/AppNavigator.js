import { ActivityIndicator, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import HomeScreen from "../screens/HomeScreen";
import CreateBillScreen from "../screens/CreateBillScreen";
import SalesHistoryScreen from "../screens/SalesHistoryScreen";

const Stack = createNativeStackNavigator();

function Loader() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#f8fafc",
      }}
    >
      <ActivityIndicator size="large" />
    </View>
  );
}

export default function AppNavigator() {
  const { booting, isLoggedIn } = useAuth();

  if (booting) return <Loader />;

  return (
    <Stack.Navigator
      screenOptions={{
        headerTitleStyle: { fontWeight: "700" },
        contentStyle: { backgroundColor: "#f1f5f9" },
      }}
    >
      {!isLoggedIn ? (
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ title: "Login", headerShown: false }}
        />
      ) : (
        <>
          <Stack.Screen
            name="Home"
            component={HomeScreen}
            options={{ title: "Home" }}
          />
          <Stack.Screen
            name="CreateBill"
            component={CreateBillScreen}
            options={{ title: "Create Bill" }}
          />
          <Stack.Screen
            name="SalesHistory"
            component={SalesHistoryScreen}
            options={{ title: "Sales History" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
