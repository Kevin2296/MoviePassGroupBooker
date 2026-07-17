# Movie Pass Groepsboeker 0.7.0

Onafhankelijke Android- en webassistent om met meerdere bezoekers dezelfde actuele Vue-voorstelling te openen. Iedere Movie Pass blijft een afzonderlijke bestelling op de officiële Vue-website.

> Openbare bèta: niet ontwikkeld, goedgekeurd of ondersteund door Vue Cinemas.

## Mogelijkheden

- Live bioscopen, films en exacte tijden ophalen.
- Een tijdelijke boekingsgroep maken of met een zescijferige code deelnemen.
- De gekozen film-ID, sessie-ID en toegestane Vue-boekingslink synchroniseren.
- Per toestel één of meerdere lokale Vue-accounts koppelen.
- Movie Pass- en gewone-ticketdeelnemers combineren.
- Live tonen wie verbonden, klaar, aan het boeken of afgerond is.
- Groepen automatisch na twaalf uur verwijderen.

## Zo boek je samen

1. Installeer de Android-app op ieder toestel en koppel per persoon het eigen Vue-account.
2. Eén persoon maakt een groep en deelt de zescijferige code.
3. De anderen kiezen **Deelnemen met code**. Alleen de groepsleider kiest daarna bioscoop, dag, film en tijd.
4. De groepsleider kiest **Voorstelling klaarzetten** en daarna **Start samen boeken**.
5. Op ieder toestel verschijnt **Open mijn Vue-bestelling**. Iedere Movie Pass blijft een afzonderlijke officiële Vue-order.
6. Spreek vooraf een eerste stoel af, kies bij de volgende orders de stoel ernaast en meld iedere afgeronde bestelling in de app.

De groepsleider kan een deelnemer uit de groep verwijderen. Wanneer iemand begint met boeken, zien de andere deelnemers die de groepsapp open hebben daar direct een melding van.

Vue-wachtwoorden, cookies en betaalgegevens worden niet naar de synchronisatieserver gestuurd. Gekoppelde Vue-sessies worden met Android Keystore en AES-GCM versleuteld op het eigen toestel opgeslagen.

## Lokaal testen

```bash
npm start
npm test
```

Open `http://localhost:4173`. De website toont de interface; het veilig bewaren en wisselen van Vue-sessies is Android-specifiek.

## Docker

```bash
docker compose up -d --build
```

De server luistert standaard op poort `4173`. Gebruik buiten het thuisnetwerk altijd HTTPS via een reverse proxy.

## Openbaar hosten op Render

Het bestand `render.yaml` beschrijft een Render Web Service met Docker, regio Frankfurt en healthcheck `/api/health`.

1. Plaats deze broncode in een GitHub-repository.
2. Maak in Render een nieuwe Blueprint vanuit die repository.
3. Vul bij `GITHUB_REPOSITORY_URL` de openbare repository-URL in.
4. Controleer `https://<render-hostnaam>/api/health`.
5. Plaats de Render-URL in het GitHub Actions-secret `SYNC_SERVER_URL`.

De Blueprint gebruikt voor de eerste bèta het gratis instance-type. Een slapende of herstartende gratis instantie wist actieve groepen, omdat privacygevoelige groepsgegevens uitsluitend in het werkgeheugen staan. Kies voor betrouwbaarder openbaar gebruik later een altijd actieve instantie.

## Openbare Android-release

De workflow `.github/workflows/release-android.yml` test de code en bouwt een ondertekende APK en Android App Bundle. Configureer deze GitHub Actions-secrets:

- `SYNC_SERVER_URL`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Maak daarna een tag zoals `v0.6.0`. De workflow publiceert APK en AAB bij de GitHub Release. De privé releasesleutel hoort nooit in de repository.

Voor een lokale Android-build zet `npm run prepare:android` de webbestanden in `android/app/src/main/assets/`. Met `SYNC_SERVER_URL=https://...` wordt het openbare serveradres vast in de app opgenomen; zonder variabele blijft het handmatige testveld zichtbaar.

## Beveiliging en privacy

- API-aanvragen zijn begrensd per tijdelijk geanonimiseerd client-ID.
- Externe of gemanipuleerde boekingslinks worden geweigerd.
- Deelnemertokens worden niet aan andere groepsleden getoond.
- Een deelnemer kan zijn gegevens direct verwijderen door de groep te verlaten.
- De groepsleider verwijdert bij vertrek de volledige groep.
- Securityheaders, HTTPS-configuratie en een privacy- en supportpagina zijn aanwezig.

Lees `SECURITY.md` voor het melden van kwetsbaarheden. Publicatie van de broncode verleent zonder afzonderlijk licentiebestand niet automatisch toestemming voor hergebruik of distributie.

## Grenzen

Vue kan CAPTCHA/Turnstile, verlopen sessies, stoelconflicten, toeslagen of een betaling tonen. De app omzeilt die controles niet en voltooit geen definitieve betaling zonder actie van de gebruiker. Twee Movie Passen blijven twee losse Vue-orders; aangrenzende stoelen zijn pas zeker nadat beide orders zijn afgerond.
