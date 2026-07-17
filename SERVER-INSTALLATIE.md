# Synchronisatieserver installeren

Voor openbaar gebruik kan dezelfde server rechtstreeks via de meegeleverde `render.yaml` op Render worden uitgerold. De GitHub-repository blijft daarna de bron voor automatische tests en deployments.

## Docker / TrueNAS

1. Pak dit ZIP-bestand uit in een eigen map.
2. Open een shell in die map.
3. Start de container:

```bash
docker compose up -d --build
```

4. Controleer lokaal: `http://IP-VAN-JE-NAS:4173/api/health`.
5. Vul in beide Android-apps hetzelfde adres in, bijvoorbeeld `http://192.168.1.20:4173`.

## Gebruik buiten je thuisnetwerk

Maak in Nginx Proxy Manager een Proxy Host die een eigen domein via HTTPS doorstuurt naar poort `4173` van deze container. Vul daarna op beide telefoons het HTTPS-adres in, bijvoorbeeld `https://films.jouwdomein.nl`.

Publiceer poort 4173 niet rechtstreeks zonder HTTPS. Er zijn geen WebSockets nodig. Controleer na publicatie altijd `/api/health`.

## Bewaarde gegevens

De server bewaart tijdelijke groepscodes, deelnemersnamen, ticketsoort, voorstelling en boekingsstatus alleen in het werkgeheugen. Kamers verlopen na twaalf uur en verdwijnen ook wanneer de container opnieuw start. Vue-logins, wachtwoorden, cookies en betaalgegevens worden niet ontvangen.
