package club.a_dobe.alma;

import android.graphics.RenderEffect;
import android.graphics.RuntimeShader;
import android.view.View;
import androidx.annotation.RequiresApi;

/**
 * Ray-cast frosted glass ported from marcoazeem/duo-open (MIT), whose
 * duo_unfold shader is based on Atomicx7/Duo-animation. The UI remains on a
 * fixed plane while rays pass through a pane tilted around the fold hinge.
 */
@RequiresApi(33)
final class FoldShaderEffect {
    private static final float REFERENCE_PX_PER_MM = 6f;

    private static final String AGSL =
        "uniform shader content;\n"
        + "uniform float2 resolution;\n"
        + "uniform float tiltDegrees;\n"
        + "uniform float eyeDistancePx;\n"
        + "uniform float hingePos;\n"
        + "uniform float eyeX;\n"
        + "uniform float axisSwap;\n"
        + "uniform float paneSide;\n"
        + "uniform float blurSpread;\n"
        + "uniform float darkening;\n"
        + "const float GOLDEN_ANGLE = 2.39996322972865332;\n"
        + "const float TWO_PI = 6.28318530717958648;\n"
        + "half4 main(float2 fragCoord) {\n"
        + "  if (resolution.x <= 1.0 || resolution.y <= 1.0) return content.eval(fragCoord);\n"
        + "  float tiltRad = clamp(tiltDegrees, 0.0, 60.0) * 0.017453292519943295;\n"
        + "  if (tiltRad < 1e-4) return content.eval(fragCoord);\n"
        + "  float2 panePoint = mix(fragCoord, fragCoord.yx, axisSwap);\n"
        + "  float2 paneSize = mix(resolution, resolution.yx, axisSwap);\n"
        + "  float sideValue = mix(-1.0, 1.0, step(hingePos, panePoint.x));\n"
        + "  if (paneSide * sideValue < -0.5) return content.eval(fragCoord);\n"
        + "  float hingeDelta = abs(panePoint.x - hingePos);\n"
        + "  float2 glassPoint = float2(hingePos + sideValue * hingeDelta * cos(tiltRad), panePoint.y);\n"
        + "  float planeGap = hingeDelta * sin(tiltRad);\n"
        + "  float2 eyePoint = float2(eyeX, paneSize.y * 0.5);\n"
        + "  float rayDepth = eyeDistancePx - planeGap;\n"
        + "  if (rayDepth <= 1e-3) return half4(0.0, 0.0, 0.0, 1.0);\n"
        + "  float2 planeHitSwapped = eyePoint + (glassPoint - eyePoint) * (eyeDistancePx / rayDepth);\n"
        + "  float blurRadius = blurSpread * planeGap;\n"
        + "  if (planeHitSwapped.x < -blurRadius || planeHitSwapped.y < -blurRadius ||\n"
        + "      planeHitSwapped.x > paneSize.x + blurRadius || planeHitSwapped.y > paneSize.y + blurRadius) {\n"
        + "    return half4(0.0, 0.0, 0.0, 1.0);\n"
        + "  }\n"
        + "  float2 planeHit = mix(planeHitSwapped, planeHitSwapped.yx, axisSwap);\n"
        + "  float attenuation = max(1.0 - darkening * blurRadius, 0.0);\n"
        + "  if (blurRadius < 0.5) return half4(content.eval(planeHit).rgb * half(attenuation), 1.0);\n"
        + "  float tapCount = clamp(blurRadius * 2.0, 6.0, 32.0);\n"
        + "  float randomRotation = fract(sin(dot(fragCoord, float2(12.9898, 78.233))) * 43758.5453) * TWO_PI;\n"
        + "  half3 colorSum = half3(0.0);\n"
        + "  float weightSum = 0.0;\n"
        + "  for (int sampleIndex = 0; sampleIndex < 32; sampleIndex++) {\n"
        + "    float sampleNumber = float(sampleIndex);\n"
        + "    float sampleWeight = 1.0 - step(tapCount, sampleNumber);\n"
        + "    float sampleRadius = blurRadius * sqrt((sampleNumber + 0.5) / tapCount);\n"
        + "    float sampleAngle = sampleNumber * GOLDEN_ANGLE + randomRotation;\n"
        + "    colorSum += content.eval(planeHit + sampleRadius * float2(cos(sampleAngle), sin(sampleAngle))).rgb * half(sampleWeight);\n"
        + "    weightSum += sampleWeight;\n"
        + "  }\n"
        + "  half3 averageColor = colorSum / half(max(weightSum, 1.0));\n"
        + "  return half4(averageColor * half(attenuation), 1.0);\n"
        + "}\n";

    private final RuntimeShader shader = new RuntimeShader(AGSL);

    static final class Geometry {
        float axis;
        float hinge = 0.5f;
        float eye = 0.5f;
        float movingSign = -1f;
        boolean inner;
    }

    void apply(View target, Geometry geometry, float tiltDegrees, float pxPerMm,
               float blurSpread, float darkening, float eyeDistanceMm) {
        int width = target.getWidth();
        int height = target.getHeight();
        if (width <= 0 || height <= 0 || tiltDegrees <= 0f || Float.isNaN(tiltDegrees)) {
            clear(target);
            return;
        }
        float splitExtent = geometry.axis < 0.5f ? width : height;
        shader.setFloatUniform("resolution", width, height);
        shader.setFloatUniform("tiltDegrees", Math.min(60f, tiltDegrees));
        shader.setFloatUniform("eyeDistancePx", eyeDistanceMm * pxPerMm);
        shader.setFloatUniform("hingePos", geometry.hinge * splitExtent);
        shader.setFloatUniform("eyeX", geometry.eye * splitExtent);
        shader.setFloatUniform("axisSwap", geometry.axis);
        shader.setFloatUniform("paneSide", geometry.movingSign);
        shader.setFloatUniform("blurSpread", blurSpread);
        shader.setFloatUniform("darkening", darkening * REFERENCE_PX_PER_MM / pxPerMm);
        target.setRenderEffect(RenderEffect.createRuntimeShaderEffect(shader, "content"));
    }

    static void clear(View target) {
        target.setRenderEffect(null);
    }
}
