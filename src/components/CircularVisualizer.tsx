import React from 'react';
import { Canvas, Path, Skia, BlurMask, Group, vec, LinearGradient } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

interface Props {
  fftData: Float32Array;
  size: number;
  colorScheme?: 'rainbow' | 'fire' | 'ocean';
}

function binColor(index: number, total: number, scheme: Props['colorScheme']): string {
  const t = index / total;
  switch (scheme) {
    case 'fire': return `hsl(${Math.round(t * 60)}, 100%, ${40 + t * 30}%)`;
    case 'ocean': return `hsl(${180 + Math.round(t * 60)}, 90%, ${40 + t * 20}%)`;
    default: return `hsl(${Math.round(t * 360)}, 100%, 55%)`;
  }
}

export const CircularVisualizer: React.FC<Props> = ({ fftData, size, colorScheme = 'rainbow' }) => {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const drag = Gesture.Pan()
    .onStart(() => { startX.value = translateX.value; startY.value = translateY.value; })
    .onUpdate(e => { translateX.value = startX.value + e.translationX; translateY.value = startY.value + e.translationY; });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  const cx = size / 2, cy = size / 2;
  const innerRadius = size * 0.18;
  const maxBarHeight = size * 0.28;
  const numBars = fftData.length;

  const bars = Array.from({ length: numBars }, (_, i) => {
    const angle = (i / numBars) * 2 * Math.PI - Math.PI / 2;
    const mag = fftData[i] ?? 0;
    const barLen = innerRadius + mag * maxBarHeight;
    const barWidth = (2 * Math.PI * innerRadius) / numBars * 0.6;
    const x1 = cx + Math.cos(angle) * innerRadius;
    const y1 = cy + Math.sin(angle) * innerRadius;
    const x2 = cx + Math.cos(angle) * barLen;
    const y2 = cy + Math.sin(angle) * barLen;
    const perpAngle = angle + Math.PI / 2;
    const hw = barWidth / 2;
    const path = Skia.Path.Make();
    path.moveTo(x1 + Math.cos(perpAngle) * hw, y1 + Math.sin(perpAngle) * hw);
    path.lineTo(x2 + Math.cos(perpAngle) * hw, y2 + Math.sin(perpAngle) * hw);
    path.lineTo(x2 - Math.cos(perpAngle) * hw, y2 - Math.sin(perpAngle) * hw);
    path.lineTo(x1 - Math.cos(perpAngle) * hw, y1 - Math.sin(perpAngle) * hw);
    path.close();
    return { path, color: binColor(i, numBars, colorScheme), mag };
  });

  const circlePath = Skia.Path.Make();
  circlePath.addCircle(cx, cy, innerRadius - 2);

  return (
    <GestureDetector gesture={drag}>
      <Animated.View style={[{ width: size, height: size }, animStyle]}>
        <Canvas style={{ width: size, height: size }}>
          {bars.map((bar, i) => (
            <Group key={i}>
              <Path path={bar.path} color={bar.color} style="fill">
                {bar.mag > 0.3 && <BlurMask blur={3} style="outer" respectCTM />}
              </Path>
            </Group>
          ))}
          <Path path={circlePath} style="fill">
            <LinearGradient
              start={vec(cx, cy - innerRadius)} end={vec(cx, cy + innerRadius)}
              colors={['#1a1a2e', '#16213e', '#0f3460']}
            />
          </Path>
        </Canvas>
      </Animated.View>
    </GestureDetector>
  );
};
