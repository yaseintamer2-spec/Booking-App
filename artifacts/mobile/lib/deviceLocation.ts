import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

export const DEVICE_LOCATION_CACHE_KEY = '@kickoff/device-location';
export const LOCATION_SKIPPED_KEY = '@kickoff/location-skipped';

export async function saveCurrentDeviceLocation() {
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  await AsyncStorage.setItem(
    DEVICE_LOCATION_CACHE_KEY,
    JSON.stringify({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      capturedAt: location.timestamp,
    }),
  );
  await AsyncStorage.removeItem(LOCATION_SKIPPED_KEY);
}

export async function skipDeviceLocation() {
  await AsyncStorage.removeItem(DEVICE_LOCATION_CACHE_KEY);
  await AsyncStorage.setItem(LOCATION_SKIPPED_KEY, 'true');
}
