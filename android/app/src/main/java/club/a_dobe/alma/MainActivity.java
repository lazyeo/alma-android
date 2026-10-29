package club.a_dobe.alma;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.ActionMode;
import android.view.Menu;
import android.view.MenuItem;
import android.webkit.WebView;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static volatile boolean foreground;
    /** Set by the web Select text reader while it is open. */
    static volatile boolean selectionActionsEnabled;
    private static final int MENU_QUOTE = 0x41A1;
    private static final int MENU_MENTION = 0x41A2;
    // Chromium orders its selection items Cut 2, Copy 3, Paste 4, Share 5…;
    // the same order lands ours right after Copy.
    private static final int MENU_ORDER = 3;
    private static final int MENU_GROUP = 0x41A0;

    static boolean isAppForeground() {
        return foreground;
    }

    @Override
    public void onStart() {
        super.onStart();
        foreground = true;
    }

    @Override
    public void onStop() {
        foreground = false;
        super.onStop();
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ThemeChromePlugin.class);
        registerPlugin(FoldTransitionPlugin.class);
        registerPlugin(ShareIntakePlugin.class);
        registerPlugin(FileHandoffPlugin.class);
        registerPlugin(HtmlPreviewPlugin.class);
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(
                (getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
        );
        getBridge().getWebView().setWebViewClient(new AlmaWebViewClient(getBridge(), this));
    }

    void emitFileLink(String path) {
        if (getBridge() == null) return;
        String quoted = org.json.JSONObject.quote(path);
        getBridge().getWebView().evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('almafilelink',{detail:{path:" + quoted + "}}))",
            null
        );
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
    }

    /**
     * Adds Quote and Mention to the WebView's own floating selection toolbar,
     * so selection keeps native handles and a single bar. On One UI the
     * WebView's menu never passes through onWindowStartingActionMode (the callback is not invoked there), so items are added once the mode has started.
     *
     * The toolbar has already measured by then, so it has to be invalidated;
     * that re-runs prepare and One UI appends its Gemini item again. The copy
     * is hidden right after and the content rect refreshed, which lays the
     * toolbar out once more from the final menu.
     */
    @Override
    public void onActionModeStarted(ActionMode mode) {
        super.onActionModeStarted(mode);
        if (!selectionActionsEnabled || mode.getType() != ActionMode.TYPE_FLOATING) return;
        Menu menu = mode.getMenu();
        if (!ensureItems(menu)) return;
        bindClick(mode, menu.findItem(MENU_QUOTE), "quote");
        bindClick(mode, menu.findItem(MENU_MENTION), "mention");
        // invalidate() re-runs prepare, which rebuilds the system items with
        // menu.removeGroup() + add. removeGroup() only drops the first
        // contiguous run of a group, and One UI's process-text items (Gemini,
        // Translate, Manage apps) sit at orders 1/13/197608 around the Copy
        // group, so every prepare left copies behind in repeated prepare calls. Clear every
        // non-Alma item first; prepare then adds each one exactly once, and
        // anything it does not re-add is restored from the snapshot.
        List<ItemSnapshot> snapshot = snapshotItems(menu);
        clearSystemItems(menu);
        mode.invalidate();
        ensureItems(menu);
        restoreMissing(menu, snapshot);
        bindClick(mode, menu.findItem(MENU_QUOTE), "quote");
        bindClick(mode, menu.findItem(MENU_MENTION), "mention");
        hideDuplicateItems(menu);
        mode.invalidateContentRect();
    }

    private void bindClick(ActionMode mode, MenuItem item, String action) {
        if (item == null) return;
        item.setOnMenuItemClickListener((clicked) -> {
            if (getBridge() != null)
                getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('almaselectionaction',{detail:'" + action + "'}))",
                    null
                );
            mode.finish();
            return true;
        });
    }

    /** One system menu item, enough to put it back with the same click route. */
    private static final class ItemSnapshot {
        final int group, id, order;
        final CharSequence title;
        final Intent intent;
        final android.graphics.drawable.Drawable icon;
        final boolean visible;

        ItemSnapshot(MenuItem item) {
            group = item.getGroupId();
            id = item.getItemId();
            order = item.getOrder();
            title = item.getTitle();
            intent = item.getIntent();
            icon = item.getIcon();
            visible = item.isVisible();
        }

        String key() {
            String target = intent == null ? ""
                : intent.getComponent() != null ? intent.getComponent().flattenToShortString()
                : String.valueOf(intent.getAction());
            return group + "/" + id + "|" + title + "|" + target;
        }
    }

    private static List<ItemSnapshot> snapshotItems(Menu menu) {
        List<ItemSnapshot> out = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < menu.size(); i++) {
            MenuItem item = menu.getItem(i);
            if (item.getGroupId() == MENU_GROUP || !item.isVisible()) continue;
            ItemSnapshot snap = new ItemSnapshot(item);
            if (seen.add(snap.key())) out.add(snap);
        }
        return out;
    }

    /** Removes every item that is not ours, including repeated ids. */
    private static void clearSystemItems(Menu menu) {
        Set<Integer> ids = new HashSet<>();
        for (int i = 0; i < menu.size(); i++)
            if (menu.getItem(i).getGroupId() != MENU_GROUP) ids.add(menu.getItem(i).getItemId());
        for (int id : ids) {
            int guard = 0;
            while (menu.findItem(id) != null && guard++ < 16) menu.removeItem(id);
        }
    }

    private static void restoreMissing(Menu menu, List<ItemSnapshot> snapshot) {
        Set<String> present = new HashSet<>();
        for (int i = 0; i < menu.size(); i++) present.add(new ItemSnapshot(menu.getItem(i)).key());
        for (ItemSnapshot snap : snapshot) {
            if (present.contains(snap.key())) continue;
            MenuItem item = menu.add(snap.group, snap.id, snap.order, snap.title);
            if (snap.intent != null) item.setIntent(snap.intent);
            if (snap.icon != null) item.setIcon(snap.icon);
            item.setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
            Log.d("AlmaSelection", "restored " + snap.key());
        }
    }

    private static boolean ensureItems(Menu menu) {
        if (menu.findItem(MENU_QUOTE) != null && menu.findItem(MENU_MENTION) != null) return false;
        menu.removeGroup(MENU_GROUP);
        menu.add(MENU_GROUP, MENU_QUOTE, MENU_ORDER, R.string.selection_menu_quote).setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
        menu.add(MENU_GROUP, MENU_MENTION, MENU_ORDER, R.string.selection_menu_mention).setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM);
        Log.d("AlmaSelection", "added Quote/Mention");
        return true;
    }

    /** Hides repeated items (same label and target) so each action shows once. */
    private static void hideDuplicateItems(Menu menu) {
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < menu.size(); i++) {
            MenuItem item = menu.getItem(i);
            if (!item.isVisible()) continue;
            Intent intent = item.getIntent();
            String target = intent == null ? ""
                : intent.getComponent() != null ? intent.getComponent().flattenToShortString()
                : intent.getPackage() != null ? intent.getPackage() : String.valueOf(intent.getAction());
            CharSequence title = item.getTitle();
            String key = (title == null && intent == null)
                ? "id:" + item.getGroupId() + "/" + item.getItemId()
                : title + "|" + target;
            if (!seen.add(key)) {
                item.setVisible(false);
                Log.d("AlmaSelection", "hid duplicate menu item " + key);
            }
        }
    }

}
