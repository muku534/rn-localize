import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Image } from 'react-native';

export default function ProfileScreen() {
  return (
    <View>
      <Text>My Profile</Text>
      <Image
        source={{ uri: 'https://example.com/avatar.png' }}
        accessibilityLabel="profile photo"
      />
      <TextInput
        testID="profile-btn"
        placeholder="Enter name"
      />
      <TouchableOpacity>
        <Text>Save Changes</Text>
      </TouchableOpacity>
      <Text>Edit Profile</Text>
      <TouchableOpacity title="My Profile">
        <Text>Submit</Text>
      </TouchableOpacity>
    </View>
  );
}
