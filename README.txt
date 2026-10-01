STYLE WISHLIST v1.2.0

PWA ottimizzata per iPhone/Safari.
Funzioni principali:
- Wishlist per stagione e anno
- Abbigliamento, scarpe e accessori
- Foto wishlist da fotocamera o galleria; nel guardaroba anche da URL web
- Salvataggio immagini e dati in IndexedDB
- Priorità, taglia, colore, marca, negozio, prezzo, link e note
- Stati: wishlist, ordinato, acquistato, scartato
- Storico acquistati e guardaroba
- Budget per stagione
- Backup/import JSON
- Navigazione a swipe e installazione "Aggiungi a Home"

Pubblicare tutti i file su HTTPS. Per iPhone: aprire in Safari > Condividi > Aggiungi a Home.


Versione 1.0.1: corretta transizione schede su Safari/iOS e reset sicuro di transform/opacity.

Versione 1.1.0:
- Rimosso il versionamento manuale via query string (?v=), fonte di un bug (sw.js registrato con
  una versione diversa dagli altri asset). Il service worker ora usa network-first per l'HTML e
  stale-while-revalidate per gli altri file, con invalidazione basata sul nome della cache.
- Aggiunto un banner "Nuova versione disponibile" quando viene rilevato un aggiornamento del
  service worker, con bottone per applicarlo subito (utile perche' Safari/iOS spesso resta
  bloccato su versioni vecchie della PWA).
- Aggiunto un promemoria automatico di backup se non ne viene fatto uno da 30 giorni (con
  cooldown di 7 giorni tra un promemoria e l'altro), perche' i dati vivono solo in IndexedDB
  sul dispositivo.
- Le foto vengono ora compresse/ridimensionate (max ~1600px, JPEG) prima di essere salvate in
  IndexedDB, per ridurre lo spazio occupato dagli scatti da fotocamera.
- Le foto aggiunte durante la creazione/modifica di un articolo vengono ripulite da IndexedDB
  se il form viene annullato senza salvare (niente piu' foto orfane).
- IndexedDB usa ora una singola connessione condivisa invece di riaprirla a ogni operazione;
  le miniature si caricano in parallelo invece che in sequenza.
- Aggiunta ricerca (nome, marca, negozio, note) e ordinamento (recenti, prezzo, priorita') in
  wishlist, acquistati e guardaroba.
- Aggiunta azione "Duplica articolo" nei dettagli.
- L'eliminazione di un articolo non usa piu' un confirm() bloccante: viene rimosso subito con
  un "Annulla" di 5 secondi prima di essere eliminato definitivamente (incluse le foto non
  piu' referenziate).
- Aggiunta una sezione "Statistiche" (speso totale, speso nell'anno corrente, top categorie)
  nella scheda Altro, insieme alla data dell'ultimo backup.
- Aggiunto un suggerimento (datalist) di anni nel campo Anno per ridurre errori di digitazione
  che rompono il filtro stagione/anno.
- Aggiunta icona maskable per il manifest e meta description nella pagina.
- Rifinitura visiva: transizioni fluide su tap di card e bottoni, badge priorità con sfondo
  tinto per una scansione più rapida, barra budget che diventa rossa e segnala l'importo
  superato quando si sfora, "grab handle" in cima al foglio (bottom sheet), mini barre
  proporzionali per le top categorie nelle Statistiche, toast e banner di aggiornamento che
  non si sovrappongono più se compaiono insieme, e stile di focus visibile per chi naviga da
  tastiera/trackpad.
- Icone dell'app (home screen, manifest) con sfondo nero invece del blu notte precedente.
- Corretto il riquadro budget: l'etichetta della stagione e il valore (o "Non impostato")
  finivano sulla stessa riga senza separazione; ora sono impilati correttamente su due righe.
- La barra di navigazione orizzontale in alto è stata sostituita da una sidebar fissa sulla
  sinistra (icone + etichette per Wishlist, Acquistati, Guardaroba, Altro), sempre visibile.
  Lo swipe orizzontale per cambiare sezione resta disponibile come prima.


Versione 1.1.2:
- Rimossa la barra di navigazione fissa in fondo.
- I tab Wishlist, Acquistati, Guardaroba e Altro sono ora in una barra orizzontale sotto il titolo della pagina.
- La barra superiore resta sticky durante lo scroll e il tab attivo e' evidenziato con una linea accentata.
- Ridotto il padding inferiore dell'app, non piu' necessario per la vecchia navigazione bottom.
- Aggiornata la cache del service worker per distribuire subito il nuovo layout.


Versione 1.2.0:
- Nel form Wishlist rimossa la modalita foto “Da web” con relativo campo URL/Aggiungi.
- I pulsanti Annulla e Salva del form articolo sono ora in alto e restano visibili durante lo scroll.
- Nei dettagli rimosso “Segna ordinato”; “Segna acquistato” diventa “Acquista”.
- Il Guardaroba ora contiene sia gli acquisti sia articoli personali aggiunti manualmente.
- Aggiunto flusso dedicato “Aggiungi al guardaroba” per capi gia posseduti, senza conteggiarli come acquisti.
- Per gli articoli personali del guardaroba sono disponibili foto da fotocamera, galleria o URL web.


Versione 1.2.1:
- Riepilogo (Articoli/Wishlist/Acquistato) sempre su 3 colonne uguali.
- Stagione e Anno con stessa altezza e allineamento.
- Testata ad altezza fissa: le schede non saltano più tra Wishlist/Acquistati/Guardaroba/Altro.
- Filtri scorrevoli con sfumatura finale; ricerca a 16px (niente zoom iOS).
- Nuovo articolo: categoria da scegliere (non più T-shirt preimpostato).
- Import backup in un'unica transazione: se fallisce, i dati attuali restano intatti.
- Service worker: la pagina viene salvata in cache solo se la risposta è valida. Cache v6.


Versione 1.3.0:
- Conferme in-app (import backup, cancella tutti i dati) al posto dei popup del browser. Cache v7.
