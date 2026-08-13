import Daily, {
  DailyMediaView,
  type DailyCall,
  type DailyEvent,
  type DailyParticipant,
} from '@daily-co/react-native-daily-js';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ScreenLayout } from '@/components/ScreenLayout';
import { useColors } from '@/hooks/useColors';

export default function CallScreen() {
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    callId: string;
    token: string;
    roomUrl: string;
    kind: 'audio' | 'video';
    peerName: string;
  }>();
  const callRef = useRef<DailyCall | null>(null);
  const [participants, setParticipants] = useState<DailyParticipant[]>([]);
  const [status, setStatus] = useState('Connecting…');
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(params.kind === 'audio');

  useEffect(() => {
    if (Platform.OS === 'web') {
      setStatus('Calls require the Petrotrack iOS or Android development build.');
      return;
    }

    const call = Daily.createCallObject();
    callRef.current = call;
    const syncParticipants = () => setParticipants(Object.values(call.participants()));
    const events: DailyEvent[] = [
      'joined-meeting',
      'participant-joined',
      'participant-updated',
      'participant-left',
    ];

    events.forEach(event => call.on(event, syncParticipants));
    call.on('error', () => setStatus('Unable to connect to the call'));
    call.on('left-meeting', () => setStatus('Call ended'));

    call.join({ url: params.roomUrl, token: params.token })
      .then(() => {
        syncParticipants();
        setStatus('Connected');
        if (params.kind === 'audio') call.setLocalVideo(false);
      })
      .catch(() => setStatus('Unable to connect to the call'));

    return () => {
      events.forEach(event => call.off(event, syncParticipants));
      void call.leave();
      call.destroy();
      callRef.current = null;
    };
  }, [params.kind, params.roomUrl, params.token]);

  const participantList = useMemo(() => participants, [participants]);
  const localParticipant = participantList.find(participant => participant.local);
  const remoteParticipants = participantList.filter(participant => !participant.local);
  const remoteParticipant = remoteParticipants[0];

  function toggleMute() {
    const nextMuted = !muted;
    callRef.current?.setLocalAudio(!nextMuted);
    setMuted(nextMuted);
  }

  function toggleCamera() {
    const nextCameraOff = !cameraOff;
    callRef.current?.setLocalVideo(!nextCameraOff);
    setCameraOff(nextCameraOff);
  }

  async function leaveCall() {
    await callRef.current?.leave();
    router.back();
  }

  if (Platform.OS === 'web') {
    return (
      <ScreenLayout title="Call">
        <View style={[styles.webFallback, { backgroundColor: colors.background }]}>
          <Ionicons name={params.kind === 'video' ? 'videocam-outline' : 'call-outline'} size={56} color={colors.primary} />
          <Text style={[styles.title, { color: colors.text }]}>In-app calls need a device build</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Daily audio and video calling is available on Android and iPhone through the Petrotrack development build.
          </Text>
          <TouchableOpacity style={[styles.leaveButton, { backgroundColor: colors.primary }]} onPress={() => router.back()}>
            <Text style={styles.leaveButtonText}>Back to messages</Text>
          </TouchableOpacity>
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title={`${params.kind === 'video' ? 'Video' : 'Audio'} call`}>
      <View style={[styles.container, { backgroundColor: '#101418' }]}>
        <View style={styles.callTopBar}>
          <View>
            <Text style={styles.peerName}>{params.peerName || 'Petrotrack user'}</Text>
            <Text style={styles.callStatus}>{status}</Text>
          </View>
          <View style={styles.callKindPill}>
            <Ionicons name={params.kind === 'video' ? 'videocam' : 'call'} size={14} color="#fff" />
            <Text style={styles.callKindText}>{params.kind === 'video' ? 'Video' : 'Audio'}</Text>
          </View>
        </View>

        {params.kind === 'video' && remoteParticipant?.videoTrack ? (
          <DailyMediaView
            videoTrack={remoteParticipant.videoTrack}
            audioTrack={remoteParticipant.audioTrack || null}
            style={styles.remoteVideo}
          />
        ) : (
          <View style={styles.audioStage}>
            <View style={styles.audioAvatar}>
              <Text style={styles.audioAvatarText}>
                {(params.peerName || '?').split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase()}
              </Text>
            </View>
            <Text style={styles.audioStageText}>
              {remoteParticipant ? 'Connected' : 'Waiting for the other user…'}
            </Text>
          </View>
        )}

        {params.kind === 'video' && localParticipant?.videoTrack && (
          <DailyMediaView
            videoTrack={localParticipant.videoTrack}
            audioTrack={localParticipant.audioTrack || null}
            mirror
            style={styles.localVideo}
          />
        )}

        <View style={styles.controls}>
          <TouchableOpacity style={styles.controlButton} onPress={toggleMute}>
            <Ionicons name={muted ? 'mic-off' : 'mic'} size={22} color="#fff" />
            <Text style={styles.controlText}>{muted ? 'Unmute' : 'Mute'}</Text>
          </TouchableOpacity>
          {params.kind === 'video' && (
            <TouchableOpacity style={styles.controlButton} onPress={toggleCamera}>
              <Ionicons name={cameraOff ? 'videocam-off' : 'videocam'} size={22} color="#fff" />
              <Text style={styles.controlText}>{cameraOff ? 'Camera on' : 'Camera off'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.endButton} onPress={() => void leaveCall()}>
            <Ionicons name="call" size={22} color="#fff" />
            <Text style={styles.controlText}>End</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  callTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 },
  peerName: { color: '#fff', fontSize: 20, fontWeight: '700' },
  callStatus: { color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 3 },
  callKindPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 7 },
  callKindText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  remoteVideo: { flex: 1, width: '100%', borderRadius: 18, overflow: 'hidden', backgroundColor: '#1d242b' },
  localVideo: { position: 'absolute', right: 26, top: 78, width: 112, height: 158, borderRadius: 12, overflow: 'hidden', backgroundColor: '#27313a' },
  audioStage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  audioAvatar: { width: 118, height: 118, borderRadius: 59, backgroundColor: '#255a43', alignItems: 'center', justifyContent: 'center' },
  audioAvatarText: { color: '#fff', fontSize: 36, fontWeight: '800' },
  audioStageText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 16 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22, paddingVertical: 18 },
  controlButton: { minWidth: 62, alignItems: 'center', gap: 5 },
  controlText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  endButton: { minWidth: 62, alignItems: 'center', gap: 5, backgroundColor: '#d64545', borderRadius: 30, paddingVertical: 12, paddingHorizontal: 15 },
  webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { fontSize: 20, fontWeight: '800', textAlign: 'center', marginTop: 18 },
  subtitle: { fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 10, maxWidth: 320 },
  leaveButton: { marginTop: 22, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  leaveButtonText: { color: '#fff', fontWeight: '700' },
});