import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView, Image, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import type { VesselPhoto } from '@/lib/types';
import { requestUploadUrl, uploadToPresignedUrl, vmVessels } from '@/lib/api';

interface Props {
  vesselId?: number;
  photos: VesselPhoto[];
  onPhotosChange: (photos: VesselPhoto[]) => void;
  pendingPhotos?: PendingPhoto[];
  onPendingPhotosChange?: (pending: PendingPhoto[]) => void;
}

export interface PendingPhoto {
  uri: string;
  name: string;
  size: number;
  contentType: string;
}

const MAX_PHOTOS = 5;

export function VesselPhotoUploader({
  vesselId,
  photos,
  onPhotosChange,
  pendingPhotos = [],
  onPendingPhotosChange,
}: Props) {
  const [uploading, setUploading] = useState(false);

  const totalCount = photos.length + pendingPhotos.length;
  const canAdd = totalCount < MAX_PHOTOS;

  const pickImage = async () => {
    if (!canAdd) {
      Alert.alert('Limit reached', `Maximum ${MAX_PHOTOS} photos per vessel`);
      return;
    }

    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission required', 'Please allow access to your photo library to upload vessel photos.');
        return;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
      selectionLimit: MAX_PHOTOS - totalCount,
    });

    if (result.canceled || result.assets.length === 0) return;

    if (vesselId) {
      await uploadImmediately(result.assets);
    } else if (onPendingPhotosChange) {
      const newPending: PendingPhoto[] = result.assets.map(asset => ({
        uri: asset.uri,
        name: asset.fileName ?? `photo-${Date.now()}.jpg`,
        size: asset.fileSize ?? 0,
        contentType: asset.mimeType ?? 'image/jpeg',
      }));
      const canAdd2 = MAX_PHOTOS - photos.length - pendingPhotos.length;
      onPendingPhotosChange([...pendingPhotos, ...newPending.slice(0, canAdd2)]);
    }
  };

  const uploadImmediately = async (assets: ImagePicker.ImagePickerAsset[]) => {
    if (!vesselId) return;
    setUploading(true);
    const newPhotos: VesselPhoto[] = [];

    for (const asset of assets) {
      try {
        const contentType = asset.mimeType ?? 'image/jpeg';
        const name = asset.fileName ?? `vessel-photo-${Date.now()}.jpg`;
        const size = asset.fileSize ?? 0;

        const { data: urlData, error: urlError } = await requestUploadUrl({ name, size, contentType });
        if (urlError || !urlData) {
          Alert.alert('Upload failed', urlError ?? 'Failed to get upload URL');
          continue;
        }

        const blob = await uriToBlob(asset.uri);
        const uploaded = await uploadToPresignedUrl(urlData.uploadURL, blob, contentType);
        if (!uploaded) {
          Alert.alert('Upload failed', 'Failed to upload photo');
          continue;
        }

        const { data: photo, error: saveError } = await vmVessels.addPhoto(vesselId, urlData.objectPath);
        if (saveError || !photo) {
          Alert.alert('Save failed', saveError ?? 'Failed to save photo');
          continue;
        }
        newPhotos.push(photo);
      } catch {
        Alert.alert('Error', 'An error occurred uploading a photo');
      }
    }

    if (newPhotos.length > 0) {
      onPhotosChange([...photos, ...newPhotos]);
    }
    setUploading(false);
  };

  const removeExisting = (photo: VesselPhoto) => {
    if (!vesselId) return;
    Alert.alert('Remove photo', 'Remove this photo from the listing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          const { error } = await vmVessels.deletePhoto(vesselId, photo.id);
          if (error) { Alert.alert('Error', error); return; }
          onPhotosChange(photos.filter(p => p.id !== photo.id));
        },
      },
    ]);
  };

  const removePending = (index: number) => {
    if (!onPendingPhotosChange) return;
    onPendingPhotosChange(pendingPhotos.filter((_, i) => i !== index));
  };

  const getImageUrl = (objectPath: string) => {
    if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
      return `${window.location.origin}/api/storage${objectPath}`;
    }
    const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? '';
    return `https://${DOMAIN}/api/storage${objectPath}`;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.label}>Photos ({totalCount}/{MAX_PHOTOS})</Text>
        {canAdd && (
          <Pressable style={styles.addBtn} onPress={pickImage} disabled={uploading}>
            {uploading ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <>
                <Ionicons name="camera-outline" size={16} color={Colors.primary} />
                <Text style={styles.addBtnText}>Add Photos</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      {totalCount === 0 ? (
        <Pressable style={styles.emptyArea} onPress={pickImage} disabled={uploading}>
          <Ionicons name="images-outline" size={36} color={Colors.textMuted} />
          <Text style={styles.emptyText}>Tap to add vessel photos</Text>
          <Text style={styles.emptySubtext}>Up to {MAX_PHOTOS} photos · JPG, PNG</Text>
        </Pressable>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll} contentContainerStyle={styles.photoList}>
          {photos.map(photo => (
            <View key={photo.id} style={styles.photoItem}>
              <Image source={{ uri: getImageUrl(photo.objectPath) }} style={styles.photo} resizeMode="cover" />
              <Pressable style={styles.removeBtn} onPress={() => removeExisting(photo)}>
                <Ionicons name="close-circle" size={20} color="#fff" />
              </Pressable>
            </View>
          ))}
          {pendingPhotos.map((p, i) => (
            <View key={`pending-${i}`} style={styles.photoItem}>
              <Image source={{ uri: p.uri }} style={styles.photo} resizeMode="cover" />
              <View style={styles.pendingOverlay}>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
              <Pressable style={styles.removeBtn} onPress={() => removePending(i)}>
                <Ionicons name="close-circle" size={20} color="#fff" />
              </Pressable>
            </View>
          ))}
          {canAdd && (
            <Pressable style={styles.addTile} onPress={pickImage} disabled={uploading}>
              {uploading ? <ActivityIndicator color={Colors.textMuted} /> : <Ionicons name="add" size={28} color={Colors.textMuted} />}
            </Pressable>
          )}
        </ScrollView>
      )}
    </View>
  );
}

async function uriToBlob(uri: string): Promise<Blob> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    return res.blob();
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = reject;
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });
}

const PHOTO_SIZE = 88;

const styles = StyleSheet.create({
  container: { marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, fontFamily: 'Inter_600SemiBold' },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: Colors.radiusSm, borderWidth: 1, borderColor: Colors.primary },
  addBtnText: { fontSize: 12, color: Colors.primary, fontFamily: 'Inter_600SemiBold' },
  emptyArea: { borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', borderRadius: Colors.radiusSm, paddingVertical: 24, alignItems: 'center', gap: 6, backgroundColor: Colors.background },
  emptyText: { fontSize: 14, color: Colors.textMuted, fontFamily: 'Inter_500Medium' },
  emptySubtext: { fontSize: 12, color: Colors.textMuted, fontFamily: 'Inter_400Regular' },
  photoScroll: { flexGrow: 0 },
  photoList: { gap: 8, paddingRight: 4 },
  photoItem: { position: 'relative', width: PHOTO_SIZE, height: PHOTO_SIZE },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: Colors.radiusSm },
  removeBtn: { position: 'absolute', top: -6, right: -6, zIndex: 10 },
  pendingOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)', borderBottomLeftRadius: Colors.radiusSm, borderBottomRightRadius: Colors.radiusSm, paddingVertical: 2, alignItems: 'center' },
  pendingText: { fontSize: 9, color: '#fff', fontFamily: 'Inter_600SemiBold' },
  addTile: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: Colors.radiusSm, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
});
