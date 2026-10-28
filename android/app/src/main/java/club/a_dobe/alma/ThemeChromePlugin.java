package club.a_dobe.alma;

import android.content.res.Configuration;
import android.graphics.Color;
import android.view.HapticFeedbackConstants;
import android.view.View;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Locale;

@CapacitorPlugin(name = "ThemeChrome")
public class ThemeChromePlugin extends Plugin {
    private final int insetTypes = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
    private WebViewListener webViewListener;
    private View.OnLayoutChangeListener layoutChangeListener;
    private int lastTop = -1;
    private int lastRight = -1;
    private int lastBottom = -1;
    private int lastLeft = -1;
    private int themeColor = Color.parseColor("#080b0d");

    @PluginMethod
    public void haptic(PluginCall call) {
        String kind = call.getString("kind", "light");
        final int feedback;
        switch (kind) {
            case "selection": feedback = HapticFeedbackConstants.CLOCK_TICK; break;
            case "medium": feedback = HapticFeedbackConstants.LONG_PRESS; break;
            default: feedback = HapticFeedbackConstants.CONTEXT_CLICK;
        }
        getActivity().runOnUiThread(() -> {
            View view = getActivity().getWindow().getDecorView();
            view.performHapticFeedback(feedback);
            call.resolve();
        });
    }

    @Override
    public void load() {
        super.load();
        WindowCompat.setDecorFitsSystemWindows(getActivity().getWindow(), false);
        View decorView = getActivity().getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decorView, (view, insets) -> {
            applyInsets(insets);
            return insets;
        });
        webViewListener = new WebViewListener() {
            @Override
            public void onPageLoaded(android.webkit.WebView view) {
                super.onPageLoaded(view);
                pushCurrentInsets();
            }

            @Override
            public void onPageCommitVisible(android.webkit.WebView view, String url) {
                super.onPageCommitVisible(view, url);
                pushCurrentInsets();
            }
        };
        getBridge().addWebViewListener(webViewListener);
        layoutChangeListener = (view, left, top, right, bottom, oldLeft, oldTop, oldRight, oldBottom) -> {
            if (right - left != oldRight - oldLeft || bottom - top != oldBottom - oldTop) {
                pushCurrentInsets();
            }
        };
        decorView.addOnLayoutChangeListener(layoutChangeListener);
        ViewCompat.requestApplyInsets(decorView);
        pushCurrentInsets();
        decorView.post(this::pushCurrentInsets);
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        pushCurrentInsets();
    }

    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);
        getActivity().getWindow().getDecorView().post(this::pushCurrentInsets);
    }

    @Override
    protected void handleOnDestroy() {
        if (layoutChangeListener != null) {
            getActivity().getWindow().getDecorView().removeOnLayoutChangeListener(layoutChangeListener);
            layoutChangeListener = null;
        }
        if (webViewListener != null && getBridge() != null) {
            getBridge().removeWebViewListener(webViewListener);
            webViewListener = null;
        }
        super.handleOnDestroy();
    }

    private void pushCurrentInsets() {
        View decorView = getActivity().getWindow().getDecorView();
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decorView);
        if (insets != null) applyInsets(insets);
        else ViewCompat.requestApplyInsets(decorView);
    }

    private void applyInsets(WindowInsetsCompat windowInsets) {
        Insets bars = windowInsets.getInsets(insetTypes);
        Insets ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime());
        boolean keyboardVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime());
        View webView = getBridge() == null ? null : getBridge().getWebView();
        if (webView == null) return;
        float density = getActivity().getResources().getDisplayMetrics().density;
        int containedBottom = keyboardVisible
            ? ime.bottom
            : bars.bottom > Math.round(24 * density) ? bars.bottom : 0;
        // WebView ignores its own padding when content scrolls, so the inset must be
        // applied to the parent: then the WebView bounds start below the status bar.
        // Reserve bottom space only for three-button navigation; gesture navigation
        // stays edge-to-edge so the navigation background can extend under the pill.
        webView.setPadding(0, 0, 0, 0);
        View host = webView.getParent() instanceof View ? (View) webView.getParent() : webView;
        host.setPadding(0, 0, 0, keyboardVisible ? ime.bottom : 0);
        if (host instanceof android.view.ViewGroup) ((android.view.ViewGroup) host).setClipToPadding(true);
        host.setBackgroundColor(themeColor);
        webView.setBackgroundColor(themeColor);
        getActivity().getWindow().getDecorView().setBackgroundColor(themeColor);
        injectInsets(
            bars.top / density, bars.right / density, bars.bottom / density, bars.left / density,
            0, 0, 0, 0
        );
    }

    private void injectInsets(float top, float right, float bottom, float left,
                              float padTop, float padRight, float padBottom, float padLeft) {
        getActivity().runOnUiThread(() -> {
            if (getBridge() == null || getBridge().getWebView() == null) return;
            String script = String.format(Locale.US,
                "(function(i,p){window.__almaNativeInsets=i;window.__almaNativePadding=p;if(window.__almaSetNativeInsets){window.__almaSetNativeInsets(i,p);}})({top:%s,right:%s,bottom:%s,left:%s},{top:%s,right:%s,bottom:%s,left:%s});",
                cssNumber(top), cssNumber(right), cssNumber(bottom), cssNumber(left),
                cssNumber(padTop), cssNumber(padRight), cssNumber(padBottom), cssNumber(padLeft));
            getBridge().getWebView().evaluateJavascript(script, null);
        });
    }

    private String cssNumber(float value) {
        return String.format(Locale.US, "%.2f", Math.max(0, value));
    }

    @PluginMethod
    public void setSelectionActions(PluginCall call) {
        MainActivity.selectionActionsEnabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        call.resolve();
    }

    @PluginMethod
    public void setFullscreen(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            WindowCompat.setDecorFitsSystemWindows(getActivity().getWindow(), false);
            pushCurrentInsets();
            call.resolve();
        });
    }

    @PluginMethod
    public void apply(PluginCall call) {
        String color = call.getString("color");
        Boolean dark = call.getBoolean("dark", true);
        final int parsed;
        try { parsed = Color.parseColor(color); }
        catch (Exception error) { call.reject("Invalid theme color"); return; }
        themeColor = parsed;
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().setNavigationBarColor(parsed);
            getActivity().getWindow().setStatusBarColor(parsed);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
                getActivity().getWindow(), getActivity().getWindow().getDecorView());
            controller.setAppearanceLightNavigationBars(!dark);
            controller.setAppearanceLightStatusBars(!dark);
            pushCurrentInsets();
            call.resolve();
        });
    }
}
