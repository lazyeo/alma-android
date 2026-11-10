package club.a_dobe.alma;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.text.TextUtils;
import android.util.Base64;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.Key;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.List;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Speech engine API keys, encrypted with an Android Keystore AES-GCM key and
 * bound to the URL they were saved for. Write-only towards JS: nothing here
 * returns a key except {@link #resolve}, which native calls right before it
 * attaches the key to a request that passed {@link SpeechHostRules}.
 */
final class SpeechKeyStore {
    static final String KEY_MISSING = "key_missing";
    static final String HOST_NOT_ALLOWED = "host_not_allowed";
    static final String IO = "io";

    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "alma_speech_keys";
    private static final String PREFS = "alma_speech_keys";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int TAG_BITS = 128;
    /** Short keys would be mostly revealed by their last four characters. */
    private static final int MIN_LENGTH_FOR_HINT = 8;

    static final class KeyException extends Exception {
        final String code;

        KeyException(String message, String code) {
            super(message);
            this.code = code;
        }
    }

    static final class Status {
        final boolean set;
        /** Null when no key is saved or the key is too short to hint at. */
        final String last4;

        Status(boolean set, String last4) {
            this.set = set;
            this.last4 = last4;
        }
    }

    private final SharedPreferences prefs;

    SpeechKeyStore(Context context) {
        prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Engine ids become preference key prefixes, so keep them plain. */
    static boolean validEngineId(String engineId) {
        return engineId != null && engineId.matches("^[A-Za-z0-9._-]{1,64}$");
    }

    /**
     * Saves the key bound to {@code boundUrls}, which the caller has checked
     * with {@link SpeechHostRules#bindable(String, List)}. Stored one per
     * line: a URL that parses as bindable cannot contain a newline.
     */
    synchronized void set(String engineId, String key, List<String> boundUrls) throws GeneralSecurityException, IOException {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey());
        byte[] ciphertext = cipher.doFinal(key.getBytes(StandardCharsets.UTF_8));
        boolean saved = prefs.edit()
            .putString(engineId + ".ct", encode(ciphertext))
            .putString(engineId + ".iv", encode(cipher.getIV()))
            .putString(engineId + ".url", TextUtils.join("\n", boundUrls))
            .putString(engineId + ".last4", key.length() >= MIN_LENGTH_FOR_HINT ? key.substring(key.length() - 4) : "")
            .commit();
        if (!saved) throw new IOException("Could not save the key");
    }

    synchronized Status status(String engineId) {
        if (!prefs.contains(engineId + ".ct")) return new Status(false, null);
        String last4 = prefs.getString(engineId + ".last4", "");
        return new Status(true, last4 == null || last4.isEmpty() ? null : last4);
    }

    synchronized void delete(String engineId) {
        prefs.edit()
            .remove(engineId + ".ct")
            .remove(engineId + ".iv")
            .remove(engineId + ".url")
            .remove(engineId + ".last4")
            .commit();
    }

    /** The plaintext key for a request to {@code requestUrl}; native use only. */
    synchronized String resolve(String engineId, String requestUrl) throws KeyException {
        String ciphertext = prefs.getString(engineId + ".ct", null);
        String iv = prefs.getString(engineId + ".iv", null);
        String boundUrls = prefs.getString(engineId + ".url", null);
        if (ciphertext == null || iv == null || boundUrls == null)
            throw new KeyException("No key saved for this engine", KEY_MISSING);
        if (!SpeechHostRules.allowedAny(Arrays.asList(boundUrls.split("\n")), requestUrl))
            throw new KeyException("The key is not bound to this address", HOST_NOT_ALLOWED);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(TAG_BITS, decode(iv)));
            return new String(cipher.doFinal(decode(ciphertext)), StandardCharsets.UTF_8);
        } catch (AEADBadTagException | KeyPermanentlyInvalidatedException | IllegalArgumentException error) {
            // The ciphertext can never be read again (Keystore key replaced
            // after a credential reset or a restore): drop it and let the
            // user enter the key once more.
            delete(engineId);
            throw new KeyException("The saved key can no longer be read", KEY_MISSING);
        } catch (GeneralSecurityException | IOException error) {
            // Possibly transient (keystore daemon busy or restarting): keep
            // the key and let the user retry.
            throw new KeyException("The key store is unavailable", IO);
        }
    }

    private static SecretKey secretKey() throws GeneralSecurityException, IOException {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        Key existing = keyStore.getKey(ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
        generator.init(
            new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    private static String encode(byte[] value) {
        return Base64.encodeToString(value, Base64.NO_WRAP);
    }

    private static byte[] decode(String value) {
        return Base64.decode(value, Base64.NO_WRAP);
    }
}
