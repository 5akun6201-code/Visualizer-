import React, { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  Modal, ActivityIndicator, Alert, StatusBar, Dimensions,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { makeImageFromView } from '@shopify/react-native-skia';
import { CircularVisualizer } from './src/components/CircularVisualizer';
import { useAudioPlayer } from './src/hooks/useAudioPlayer';
import { VideoExporter } from './src/utils/videoExport';

const SCREEN = Dimensions.get('window');
type ColorScheme = 'rainbow' | 'fire' | 'ocean';
type Resolution = { label: string; width: number; height: number };
const RESOLUTIONS: Resolution[] = [
  { label: '720p', width: 1280, height: 720 },
  { label: '1080p', width: 1920, height: 1080 },
  { label: 'Square', width: 1080, height: 1080 },
];

export default function App() {
  const [fps, setFps] = useState(30);
  const [resolution, setResolution] = useState<Resolution>(RESOLUTIONS[0]);
  const [colorScheme, setColorScheme] = useState<ColorScheme>('rainbow');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const exporterRef = useRef<VideoExporter | null>(null);
  const previewRef = useRef<View>(null);
  const [playerState, playerControls] = useAudioPlayer(fps);

  const pickAudio = useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setAudioUri(uri);
    await playerControls.load(uri);
  }, [playerControls]);

  const pickBg = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
    if (!result.canceled) setBgImage(result.assets[0].uri);
  }, []);

  const togglePlay = useCallback(async () => {
    if (playerState.isPlaying) await playerControls.pause();
    else await playerControls.play();
  }, [playerState.isPlaying, playerControls]);

  const startExport = useCallback(async () => {
    if (!audioUri) return Alert.alert('Pilih audio dulu!');
    if (!previewRef.current) return;
    setIsExporting(true);
    setExportProgress(0);
    const exporter = new VideoExporter({
      audioUri, fps, width: resolution.width, height: resolution.height,
      durationMs: playerState.duration,
      onProgress: setExportProgress,
      onDone: () => { setIsExporting(false); Alert.alert('✅ Selesai!', 'Video tersimpan di galeri.'); },
      onError: (msg) => { setIsExporting(false); Alert.alert('❌ Error', msg); },
    });
    exporterRef.current = exporter;
    await exporter.init();
    await playerControls.seek(0);
    const totalFrames = Math.floor((playerState.duration / 1000) * fps);
    for (let i = 0; i < totalFrames; i++) {
      if (!exporterRef.current) break;
      await playerControls.seek((i / fps) * 1000);
      await new Promise(r => setTimeout(r, 16));
      const snapshot = await makeImageFromView(previewRef);
      if (snapshot) await exporter.saveFrame(snapshot.encodeToBase64());
    }
    await playerControls.pause();
    await exporter.encode();
  }, [audioUri, fps, resolution, playerState.duration, playerControls]);

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  const vizSize = Math.min(SCREEN.width, SCREEN.height) * 0.65;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <View style={styles.previewWrapper}>
        <View ref={previewRef} style={styles.preview} collapsable={false}>
          {bgImage
            ? <Image source={{ uri: bgImage }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0f0c1d' }]} />
          }
          {playerState.isLoaded && (
            <CircularVisualizer fftData={playerState.fftData} size={vizSize} colorScheme={colorScheme} />
          )}
          {!playerState.isLoaded && !playerState.isAnalyzing && (
            <Text style={styles.placeholderText}>Pilih audio untuk mulai 🎵</Text>
          )}
          {playerState.isAnalyzing && (
            <View style={styles.analyzingOverlay}>
              <ActivityIndicator size="large" color="#7c5cbf" />
              <Text style={styles.analyzingText}>
                Menganalisis... {Math.round(playerState.analysisProgress * 100)}%
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.transport}>
        <Text style={styles.timeText}>{formatTime(playerState.position)} / {formatTime(playerState.duration)}</Text>
        <View style={styles.seekBar}>
          <View style={[styles.seekFill, {
            width: playerState.duration > 0 ? `${(playerState.position / playerState.duration) * 100}%` : '0%'
          }]} />
        </View>
        <View style={styles.btnRow}>
          <TouchableOpacity style={styles.btn} onPress={pickAudio}>
            <Text style={styles.btnIcon}>🎵</Text>
            <Text style={styles.btnLabel}>Audio</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={togglePlay} disabled={!playerState.isLoaded}>
            <Text style={[styles.btnIcon, { fontSize: 24 }]}>{playerState.isPlaying ? '⏸' : '▶️'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={pickBg}>
            <Text style={styles.btnIcon}>🖼️</Text>
            <Text style={styles.btnLabel}>BG</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btn} onPress={() => setShowSettings(true)}>
            <Text style={styles.btnIcon}>⚙️</Text>
            <Text style={styles.btnLabel}>Setting</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, playerState.isLoaded ? styles.btnExport : styles.btnDisabled]}
            onPress={startExport} disabled={!playerState.isLoaded || isExporting}>
            <Text style={styles.btnIcon}>📤</Text>
            <Text style={styles.btnLabel}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isExporting && (
        <Modal transparent animationType="fade">
          <View style={styles.exportOverlay}>
            <View style={styles.exportCard}>
              <Text style={styles.exportTitle}>Exporting...</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${exportProgress * 100}%` }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(exportProgress * 100)}%</Text>
              <Text style={styles.exportNote}>Proses jalan di background ✅</Text>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { exporterRef.current?.abort(); setIsExporting(false); }}>
                <Text style={styles.cancelText}>Batalkan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <Modal visible={showSettings} transparent animationType="slide">
        <View style={styles.settingsOverlay}>
          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>⚙️ Settings</Text>
            <Text style={styles.settingLabel}>FPS</Text>
            <View style={styles.optionRow}>
              {[24, 30, 60].map(f => (
                <TouchableOpacity key={f} style={[styles.optionBtn, fps === f && styles.optionBtnActive]} onPress={() => setFps(f)}>
                  <Text style={[styles.optionText, fps === f && styles.optionTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.settingLabel}>Resolusi</Text>
            <View style={styles.optionRow}>
              {RESOLUTIONS.map(r => (
                <TouchableOpacity key={r.label} style={[styles.optionBtn, resolution.label === r.label && styles.optionBtnActive]} onPress={() => setResolution(r)}>
                  <Text style={[styles.optionText, resolution.label === r.label && styles.optionTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.settingLabel}>Warna</Text>
            <View style={styles.optionRow}>
              {(['rainbow', 'fire', 'ocean'] as ColorScheme[]).map(c => (
                <TouchableOpacity key={c} style={[styles.optionBtn, colorScheme === c && styles.optionBtnActive]} onPress={() => setColorScheme(c)}>
                  <Text style={[styles.optionText, colorScheme === c && styles.optionTextActive]}>
                    {c === 'rainbow' ? '🌈' : c === 'fire' ? '🔥' : '🌊'} {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.closeBtnWrap} onPress={() => setShowSettings(false)}>
              <Text style={styles.closeBtn}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0f' },
  previewWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 12 },
  preview: { width: '100%', aspectRatio: 16/9, borderRadius: 12, overflow: 'hidden', backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: '#555', fontSize: 16 },
  analyzingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', gap: 12 },
  analyzingText: { color: '#ccc', fontSize: 14 },
  transport: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  timeText: { color: '#888', fontSize: 12, textAlign: 'center' },
  seekBar: { height: 4, backgroundColor: '#2a2a3a', borderRadius: 2, overflow: 'hidden' },
  seekFill: { height: '100%', backgroundColor: '#7c5cbf', borderRadius: 2 },
  btnRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  btn: { alignItems: 'center', padding: 10, borderRadius: 12, backgroundColor: '#1a1a2e', minWidth: 56 },
  btnPrimary: { backgroundColor: '#7c5cbf', minWidth: 64, paddingVertical: 14 },
  btnExport: { backgroundColor: '#1a3a1a' },
  btnDisabled: { backgroundColor: '#1a1a1a', opacity: 0.4 },
  btnIcon: { fontSize: 18 },
  btnLabel: { color: '#888', fontSize: 10, marginTop: 2 },
  exportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', alignItems: 'center', justifyContent: 'center' },
  exportCard: { width: '80%', backgroundColor: '#1a1a2e', borderRadius: 16, padding: 24, alignItems: 'center', gap: 14 },
  exportTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },
  progressBar: { width: '100%', height: 8, backgroundColor: '#2a2a3a', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#7c5cbf', borderRadius: 4 },
  progressText: { color: '#aaa', fontSize: 14 },
  exportNote: { color: '#666', fontSize: 12, textAlign: 'center' },
  cancelBtn: { marginTop: 4, paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#3a1a1a', borderRadius: 8 },
  cancelText: { color: '#e06060', fontWeight: '600' },
  settingsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  settingsCard: { backgroundColor: '#12121e', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 12 },
  settingsTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  settingLabel: { color: '#888', fontSize: 12, marginTop: 8 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#1e1e30', borderWidth: 1, borderColor: '#2a2a40' },
  optionBtnActive: { backgroundColor: '#7c5cbf', borderColor: '#9a7ce0' },
  optionText: { color: '#aaa', fontSize: 13 },
  optionTextActive: { color: '#fff', fontWeight: '600' },
  closeBtnWrap: { marginTop: 16, paddingVertical: 14, backgroundColor: '#7c5cbf', borderRadius: 12, alignItems: 'center' },
  closeBtn: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
