import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';

export default function HomeScreen() {
  return (
    <View>
      <Text>Welcome back</Text>
      <Text>Good morning! Hope you have a great day.</Text>
      <TextInput placeholder="Search here..." />
      <TouchableOpacity>
        <Text>Get Started</Text>
      </TouchableOpacity>
      <Text style={{ fontSize: 12 }}>Already have an account?</Text>
    </View>
  );
}
