package nl.kevin.moviepass;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.DateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

public class MainActivity extends Activity {
    private static final String VUE_URL = "https://www.vuecinemas.nl/";
    private static final String LOCAL_URL = "file:///android_asset/index.html";
    private static final String KEY_ALIAS = "moviepass_session_key_v1";

    private WebView webView;
    private LinearLayout actionBar;
    private TextView actionText;
    private Button actionPrimary;
    private Button actionSecondary;
    private SharedPreferences prefs;
    private final AppBridge bridge = new AppBridge();
    private String pendingAccountId;
    private String pendingAccountName;
    private JSONObject pendingRestore;
    private boolean restoreInjected;
    private JSONArray bookingAccounts;
    private JSONObject bookingShowing;
    private int bookingIndex;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(11, 13, 19));
        getWindow().setNavigationBarColor(Color.rgb(11, 13, 19));
        prefs = getSharedPreferences("moviepass_profiles", MODE_PRIVATE);
        migrateLegacySessions();

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(11, 13, 19));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setUserAgentString(settings.getUserAgentString() + " MoviePassGroepsboeker/0.6");
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("moviepass-check".equals(uri.getScheme())) {
                    boolean loggedIn = "1".equals(uri.getQueryParameter("ok"));
                    runOnUiThread(() -> finishLoginCheck(loggedIn));
                    return true;
                }
                if ("file".equals(uri.getScheme())) return false;
                String host = uri.getHost();
                if (isVueHost(host)) return false;
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url.startsWith("file:///android_asset/")) {
                    hideActionBar();
                    return;
                }
                if (isVueUrl(url) && pendingRestore != null && !restoreInjected) injectRestoredStorage();
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        createActionBar(root);
        setContentView(root);
        loadLocalApp();
    }

    private void createActionBar(FrameLayout root) {
        actionBar = new LinearLayout(this);
        actionBar.setOrientation(LinearLayout.VERTICAL);
        actionBar.setPadding(dp(16), dp(13), dp(16), dp(16));
        actionBar.setBackgroundColor(Color.rgb(20, 23, 34));
        actionBar.setElevation(dp(12));

        actionText = new TextView(this);
        actionText.setTextColor(Color.WHITE);
        actionText.setTextSize(15);
        actionText.setPadding(0, 0, 0, dp(10));
        actionBar.addView(actionText, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));

        LinearLayout buttons = new LinearLayout(this);
        buttons.setOrientation(LinearLayout.HORIZONTAL);
        actionPrimary = new Button(this);
        actionSecondary = new Button(this);
        buttons.addView(actionPrimary, new LinearLayout.LayoutParams(0, dp(48), 1));
        LinearLayout.LayoutParams secondaryParams = new LinearLayout.LayoutParams(0, dp(48), 1);
        secondaryParams.setMarginStart(dp(8));
        buttons.addView(actionSecondary, secondaryParams);
        actionBar.addView(buttons);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM);
        root.addView(actionBar, params);
        actionBar.setVisibility(View.GONE);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void migrateLegacySessions() {
        if (prefs.getInt("session_schema", 0) >= 2) return;
        SharedPreferences.Editor editor = prefs.edit();
        for (String key : prefs.getAll().keySet()) {
            if (key.startsWith("profile_")) editor.remove(key);
        }
        editor.remove("active_account_id");
        editor.putInt("session_schema", 2);
        editor.apply();
    }

    private boolean isVueHost(String host) {
        return host != null && (host.equals("vuecinemas.nl") || host.endsWith(".vuecinemas.nl"));
    }

    private boolean isVueUrl(String url) {
        try { return isVueHost(Uri.parse(url).getHost()); }
        catch (Exception ignored) { return false; }
    }

    private void loadLocalApp() {
        pendingRestore = null;
        restoreInjected = false;
        webView.addJavascriptInterface(bridge, "MoviePassNative");
        webView.loadUrl(LOCAL_URL);
    }

    private void leaveLocalApp() {
        webView.removeJavascriptInterface("MoviePassNative");
    }

    private void clearVueSession(Runnable done) {
        WebStorage.getInstance().deleteAllData();
        CookieManager.getInstance().removeAllCookies(value -> {
            CookieManager.getInstance().flush();
            runOnUiThread(done);
        });
    }

    private void startLink(String id, String name) {
        pendingAccountId = id;
        pendingAccountName = name;
        bookingAccounts = null;
        prefs.edit().remove("active_account_id").apply();
        leaveLocalApp();
        clearVueSession(() -> {
            actionText.setText("Log bij Vue in als " + name + ". Tik daarna hieronder op ‘Account opslaan’.");
            actionPrimary.setEnabled(true);
            actionPrimary.setText("Account opslaan");
            actionSecondary.setText("Annuleren");
            actionPrimary.setOnClickListener(v -> saveCurrentAccount());
            actionSecondary.setOnClickListener(v -> {
                clearVueSession(this::loadLocalApp);
            });
            actionBar.setVisibility(View.VISIBLE);
            webView.loadUrl(VUE_URL);
        });
    }

    private void saveCurrentAccount() {
        if (!isVueUrl(webView.getUrl())) {
            Toast.makeText(this, "Open eerst de Vue-website en log daar in.", Toast.LENGTH_LONG).show();
            return;
        }
        actionPrimary.setEnabled(false);
        actionPrimary.setText("Login controleren…");
        String script = "fetch('/api/microservice/loyalty/User',{credentials:'include',headers:{Accept:'application/json'}}).then(function(r){return r.json()}).then(function(d){location.href='moviepass-check://result?ok='+(d&&d.result?'1':'0')}).catch(function(){location.href='moviepass-check://result?ok=0'});";
        webView.evaluateJavascript(script, null);
    }

    private void finishLoginCheck(boolean loggedIn) {
        if (!loggedIn) {
            actionPrimary.setEnabled(true);
            actionPrimary.setText("Account opslaan");
            Toast.makeText(this, "Vue ziet dit account nog niet als ingelogd. Log eerst volledig in en probeer opnieuw.", Toast.LENGTH_LONG).show();
            return;
        }
        String script = "(function(){var l={},s={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);l[k]=localStorage.getItem(k)}for(var j=0;j<sessionStorage.length;j++){var q=sessionStorage.key(j);s[q]=sessionStorage.getItem(q)}return JSON.stringify({local:l,session:s,url:location.href});})()";
        webView.evaluateJavascript(script, value -> {
            try {
                String storageJson = new JSONArray("[" + value + "]").getString(0);
                JSONObject storage = new JSONObject(storageJson);
                String cookies = CookieManager.getInstance().getCookie(VUE_URL);
                JSONObject profile = new JSONObject();
                profile.put("id", pendingAccountId);
                profile.put("name", pendingAccountName);
                profile.put("cookies", cookies == null ? "" : cookies);
                profile.put("storage", storage);
                profile.put("linkedAt", System.currentTimeMillis());
                profile.put("loginVerified", true);
                prefs.edit().putString("profile_" + pendingAccountId, encrypt(profile.toString())).apply();
                prefs.edit().putString("active_account_id", pendingAccountId).apply();
                Toast.makeText(this, pendingAccountName + " is gekoppeld", Toast.LENGTH_SHORT).show();
                loadLocalApp();
            } catch (Exception e) {
                actionPrimary.setEnabled(true);
                actionPrimary.setText("Account opslaan");
                Toast.makeText(this, "Account kon niet veilig worden opgeslagen.", Toast.LENGTH_LONG).show();
            }
        });
    }

    private void startBookingRound(String planJson) {
        try {
            JSONObject plan = new JSONObject(planJson);
            bookingAccounts = plan.getJSONArray("accounts");
            bookingShowing = plan.getJSONObject("showing");
            if (bookingAccounts.length() < 1) throw new Exception("too few accounts");
            bookingIndex = 0;
            leaveLocalApp();
            openBookingAccount();
        } catch (Exception e) {
            Toast.makeText(this, "De boekingsronde kon niet worden gestart.", Toast.LENGTH_LONG).show();
        }
    }

    private void openBookingAccount() {
        try {
            JSONObject account = bookingAccounts.getJSONObject(bookingIndex);
            JSONObject profile = readProfile(account.getString("id"));
            if (profile == null) {
                Toast.makeText(this, "Koppel " + account.getString("name") + " opnieuw.", Toast.LENGTH_LONG).show();
                loadLocalApp();
                return;
            }
            actionText.setText((bookingIndex + 1) + "/" + bookingAccounts.length() + " · " + account.getString("name") + " — " + bookingShowing.optString("film") + ", " + bookingShowing.optString("date") + " om " + bookingShowing.optString("time") + ". Kies één stoel en rond deze Vue-order af.");
            actionPrimary.setEnabled(true);
            actionPrimary.setText(bookingIndex + 1 < bookingAccounts.length() ? "Volgende account" : "Boekingsronde klaar");
            actionSecondary.setText("Stoppen");
            actionPrimary.setOnClickListener(v -> advanceBooking());
            actionSecondary.setOnClickListener(v -> loadLocalApp());
            actionBar.setVisibility(View.VISIBLE);
            String bookingPath = bookingShowing.optString("bookingUrl", "/");
            String targetUrl = bookingPath.startsWith("http") ? bookingPath : VUE_URL.substring(0, VUE_URL.length() - 1) + bookingPath;
            String activeAccountId = prefs.getString("active_account_id", "");
            if (account.getString("id").equals(activeAccountId)) {
                pendingRestore = null;
                restoreInjected = false;
                webView.loadUrl(targetUrl);
            } else {
                restoreProfile(profile, targetUrl);
            }
        } catch (Exception e) {
            Toast.makeText(this, "Account kon niet worden geopend.", Toast.LENGTH_LONG).show();
            loadLocalApp();
        }
    }

    private void advanceBooking() {
        if (bookingIndex + 1 >= bookingAccounts.length()) {
            Toast.makeText(this, "Boekingsronde afgerond", Toast.LENGTH_SHORT).show();
            loadLocalApp();
            return;
        }
        bookingIndex++;
        openBookingAccount();
    }

    private void restoreProfile(JSONObject profile, String targetUrl) {
        pendingRestore = profile;
        restoreInjected = false;
        clearVueSession(() -> {
            String cookies = profile.optString("cookies", "");
            if (!cookies.isEmpty()) {
                for (String cookie : cookies.split(";\\s*")) CookieManager.getInstance().setCookie(VUE_URL, cookie + "; Path=/; Secure");
                CookieManager.getInstance().flush();
            }
            webView.loadUrl(targetUrl);
        });
    }

    private JSONObject requestJson(String path, String method, String cookies) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(VUE_URL.substring(0, VUE_URL.length() - 1) + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(20000);
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36");
        if (cookies != null && !cookies.isEmpty()) connection.setRequestProperty("Cookie", cookies);
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder body = new StringBuilder();
        if (stream != null) {
            BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
            String line;
            while ((line = reader.readLine()) != null) body.append(line);
            reader.close();
        }
        if (status < 200 || status >= 300) throw new Exception("Vue gaf foutcode " + status + ".");
        JSONObject result = new JSONObject();
        result.put("payload", new JSONObject(body.toString()));
        result.put("cookies", readResponseCookies(connection));
        connection.disconnect();
        return result;
    }

    private String postSync(String serverUrl, String path, String bodyJson) {
        HttpURLConnection connection = null;
        try {
            String server = serverUrl == null ? "" : serverUrl.trim().replaceAll("/+$", "");
            if (!(server.startsWith("https://") || server.startsWith("http://"))) throw new Exception("Ongeldig synchronisatieserveradres.");
            if (path == null || !path.startsWith("/api/rooms/")) throw new Exception("Ongeldige synchronisatie-aanvraag.");
            connection = (HttpURLConnection) new URL(server + path).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] bytes = (bodyJson == null ? "{}" : bodyJson).getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            OutputStream output = connection.getOutputStream();
            output.write(bytes);
            output.close();
            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 400 ? connection.getInputStream() : connection.getErrorStream();
            StringBuilder response = new StringBuilder();
            if (stream != null) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
                String line;
                while ((line = reader.readLine()) != null) response.append(line);
                reader.close();
            }
            if (response.length() == 0) throw new Exception("De synchronisatieserver gaf geen antwoord.");
            return response.toString();
        } catch (Exception e) {
            try {
                JSONObject error = new JSONObject();
                error.put("error", e.getMessage() == null ? "Synchroniseren is mislukt." : e.getMessage());
                return error.toString();
            } catch (Exception ignored) {
                return "{\"error\":\"Synchroniseren is mislukt.\"}";
            }
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void openRegularBooking(String showingJson) {
        try {
            JSONObject showing = new JSONObject(showingJson);
            String bookingPath = showing.optString("bookingUrl", "/");
            String targetUrl = bookingPath.startsWith("http") ? bookingPath : VUE_URL.substring(0, VUE_URL.length() - 1) + bookingPath;
            leaveLocalApp();
            actionText.setText(showing.optString("film") + " — " + showing.optString("date") + " om " + showing.optString("time") + ". Voeg hier het gewone ticket toe.");
            actionPrimary.setEnabled(true);
            actionPrimary.setText("Boeking klaar");
            actionSecondary.setText("Terug naar groep");
            actionPrimary.setOnClickListener(v -> loadLocalApp());
            actionSecondary.setOnClickListener(v -> loadLocalApp());
            actionBar.setVisibility(View.VISIBLE);
            webView.loadUrl(targetUrl);
        } catch (Exception e) {
            Toast.makeText(this, "De gewone ticketboeking kon niet worden geopend.", Toast.LENGTH_LONG).show();
        }
    }

    private String readResponseCookies(HttpURLConnection connection) {
        StringBuilder cookies = new StringBuilder();
        for (Map.Entry<String, List<String>> entry : connection.getHeaderFields().entrySet()) {
            if (entry.getKey() == null || !"set-cookie".equalsIgnoreCase(entry.getKey())) continue;
            for (String value : entry.getValue()) {
                String pair = value.split(";", 2)[0];
                if (cookies.length() > 0) cookies.append("; ");
                cookies.append(pair);
            }
        }
        return cookies.toString();
    }

    private String mergeCookies(String... cookieStrings) {
        LinkedHashMap<String, String> pairs = new LinkedHashMap<>();
        for (String cookies : cookieStrings) {
            if (cookies == null) continue;
            for (String pair : cookies.split(";\\s*")) {
                int equals = pair.indexOf('=');
                if (equals > 0) pairs.put(pair.substring(0, equals), pair.substring(equals + 1));
            }
        }
        StringBuilder merged = new StringBuilder();
        for (Map.Entry<String, String> pair : pairs.entrySet()) {
            if (merged.length() > 0) merged.append("; ");
            merged.append(pair.getKey()).append('=').append(pair.getValue());
        }
        return merged.toString();
    }

    private JSONObject fetchSchedule(String cinemaName, String date) throws Exception {
        if (!date.matches("\\d{4}-\\d{2}-\\d{2}")) throw new Exception("Ongeldige datum.");
        JSONObject token = requestJson("/api/microservice/auth/token", "POST", "");
        String cookies = token.optString("cookies", "");
        JSONObject cinemasResponse = requestJson("/api/microservice/showings/cinemas", "GET", cookies);
        cookies = mergeCookies(cookies, cinemasResponse.optString("cookies", ""));
        JSONArray groups = cinemasResponse.getJSONObject("payload").optJSONArray("result");
        JSONObject selectedCinema = null;
        if (groups != null) {
            for (int groupIndex = 0; groupIndex < groups.length() && selectedCinema == null; groupIndex++) {
                JSONArray cinemas = groups.getJSONObject(groupIndex).optJSONArray("cinemas");
                if (cinemas == null) continue;
                for (int cinemaIndex = 0; cinemaIndex < cinemas.length(); cinemaIndex++) {
                    JSONObject cinema = cinemas.getJSONObject(cinemaIndex);
                    if (cinemaName.equalsIgnoreCase(cinema.optString("cinemaName"))) {
                        selectedCinema = cinema;
                        break;
                    }
                }
            }
        }
        if (selectedCinema == null) throw new Exception("Vue " + cinemaName + " is niet gevonden.");
        String cinemaId = selectedCinema.getString("cinemaId");
        String path = "/api/microservice/showings/cinemas/" + cinemaId + "/films?showingDate=" + date + "&includesSession=true&includeSessionAttributes=true&minEmbargoLevel=1";
        JSONObject scheduleResponse = requestJson(path, "GET", cookies);
        JSONArray sourceFilms = scheduleResponse.getJSONObject("payload").optJSONArray("result");
        JSONArray films = new JSONArray();
        if (sourceFilms != null) {
            for (int filmIndex = 0; filmIndex < sourceFilms.length(); filmIndex++) {
                JSONObject sourceFilm = sourceFilms.getJSONObject(filmIndex);
                JSONObject film = new JSONObject();
                film.put("filmId", sourceFilm.optString("filmId"));
                film.put("title", sourceFilm.optString("filmTitle"));
                JSONArray sessions = new JSONArray();
                JSONArray showingGroups = sourceFilm.optJSONArray("showingGroups");
                if (showingGroups != null) {
                    for (int groupIndex = 0; groupIndex < showingGroups.length(); groupIndex++) {
                        JSONArray sourceSessions = showingGroups.getJSONObject(groupIndex).optJSONArray("sessions");
                        if (sourceSessions == null) continue;
                        for (int sessionIndex = 0; sessionIndex < sourceSessions.length(); sessionIndex++) {
                            JSONObject source = sourceSessions.getJSONObject(sessionIndex);
                            JSONObject session = new JSONObject();
                            String startTime = source.optString("startTime");
                            session.put("sessionId", source.optString("sessionId"));
                            session.put("time", startTime.length() >= 16 ? startTime.substring(11, 16) : startTime);
                            session.put("startTime", startTime);
                            session.put("bookingUrl", source.optString("bookingUrl"));
                            session.put("formattedPrice", source.optString("formattedPrice"));
                            session.put("screenName", source.optString("screenName"));
                            session.put("isSoldOut", source.optBoolean("isSoldOut"));
                            session.put("isBookingAvailable", source.optBoolean("isBookingAvailable"));
                            sessions.put(session);
                        }
                    }
                }
                if (sessions.length() > 0) {
                    film.put("sessions", sessions);
                    films.put(film);
                }
            }
        }
        JSONObject result = new JSONObject();
        result.put("cinemaId", cinemaId);
        result.put("cinemaName", selectedCinema.optString("cinemaName"));
        result.put("date", date);
        result.put("films", films);
        return result;
    }

    private void injectRestoredStorage() {
        restoreInjected = true;
        JSONObject storage = pendingRestore.optJSONObject("storage");
        if (storage == null) return;
        String data = storage.toString();
        String script = "(function(){var d=JSON.parse(" + JSONObject.quote(data) + ");localStorage.clear();sessionStorage.clear();Object.keys(d.local||{}).forEach(function(k){localStorage.setItem(k,d.local[k])});Object.keys(d.session||{}).forEach(function(k){sessionStorage.setItem(k,d.session[k])});return true;})()";
        webView.evaluateJavascript(script, value -> {
            pendingRestore = null;
            webView.reload();
        });
    }

    private JSONObject readProfile(String id) {
        try {
            String encrypted = prefs.getString("profile_" + id, null);
            return encrypted == null ? null : new JSONObject(decrypt(encrypted));
        } catch (Exception ignored) { return null; }
    }

    private void hideActionBar() {
        actionBar.setVisibility(View.GONE);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    private String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8));
        JSONObject wrapper = new JSONObject();
        wrapper.put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP));
        wrapper.put("data", Base64.encodeToString(encrypted, Base64.NO_WRAP));
        return wrapper.toString();
    }

    private String decrypt(String wrapped) throws Exception {
        JSONObject wrapper = new JSONObject(wrapped);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, Base64.decode(wrapper.getString("iv"), Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(wrapper.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    private final class AppBridge {
        @JavascriptInterface
        public String listAccounts() {
            JSONArray result = new JSONArray();
            Iterator<String> keys = prefs.getAll().keySet().iterator();
            while (keys.hasNext()) {
                String key = keys.next();
                if (!key.startsWith("profile_")) continue;
                try {
                    JSONObject profile = new JSONObject(decrypt(prefs.getString(key, "")));
                    JSONObject item = new JSONObject();
                    item.put("id", profile.getString("id"));
                    item.put("name", profile.getString("name"));
                    item.put("linked", true);
                    item.put("linkedAt", DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(profile.optLong("linkedAt"))));
                    result.put(item);
                } catch (Exception ignored) { }
            }
            return result.toString();
        }

        @JavascriptInterface
        public void startAccountLink(String id, String name) {
            runOnUiThread(() -> startLink(id, name));
        }

        @JavascriptInterface
        public void removeAccount(String id) {
            prefs.edit().remove("profile_" + id).apply();
            if (id.equals(prefs.getString("active_account_id", ""))) prefs.edit().remove("active_account_id").apply();
        }

        @JavascriptInterface
        public void startBooking(String planJson) {
            runOnUiThread(() -> startBookingRound(planJson));
        }

        @JavascriptInterface
        public String getSchedule(String cinemaName, String date) {
            try {
                return fetchSchedule(cinemaName, date).toString();
            } catch (Exception e) {
                try {
                    JSONObject error = new JSONObject();
                    error.put("error", e.getMessage() == null ? "Vue-programma kon niet worden geladen." : e.getMessage());
                    return error.toString();
                } catch (Exception ignored) {
                    return "{\"error\":\"Vue-programma kon niet worden geladen.\"}";
                }
            }
        }

        @JavascriptInterface
        public String syncPost(String serverUrl, String path, String bodyJson) {
            return postSync(serverUrl, path, bodyJson);
        }

        @JavascriptInterface
        public void openRegularBooking(String showingJson) {
            runOnUiThread(() -> MainActivity.this.openRegularBooking(showingJson));
        }

        @JavascriptInterface
        public void shareText(String value) {
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_SEND);
                intent.setType("text/plain");
                intent.putExtra(Intent.EXTRA_TEXT, value);
                startActivity(Intent.createChooser(intent, "Groepscode delen"));
            });
        }
    }

    @Override
    public void onBackPressed() {
        if (actionBar.getVisibility() == View.VISIBLE) {
            loadLocalApp();
        } else if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
