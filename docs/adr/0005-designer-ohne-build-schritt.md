# Der Designer kommt ohne Build-Schritt aus

Der Designer ist in Lit und reinem JavaScript (ES-Module) geschrieben und läuft ohne Build-Schritt. Lit liegt als eine gepinnte Datei (`lit-all.min.js`) im Repo, deren SHA-256 geprüft wird; die Integration liefert die Module unverändert aus `custom_components/lunactl/frontend/` aus, unter einem Pfad mit ihrer Version, damit Browser nach einem Update keinen alten Designer behalten. HACS installiert damit genau das, was im Repo liegt. Das Repo braucht weder npm noch einen Bundler noch eine Release-Pipeline; Node wird nur für Tests verwendet.

Lit, weil HA sein Frontend selbst mit Lit baut und dessen Elemente wie Entitäts-Auswahl ebenfalls Lit-Elemente sind. HAs eigenes Lit ist nicht nach außen verfügbar und lässt sich nur über interne Umwege abgreifen, die bei HA-Updates brechen. Deshalb bringt der Designer sein eigenes mit.

Logik und Darstellung sind getrennt: Was die Vorschau pro Slot zeigt und wie der Designer ein Manifest bearbeitet, steckt in Modulen ohne Lit und DOM. Diese testet `node --test` tabellarisch mit Golden-Dateien; `node --check` prüft die Syntax aller Module. Browser-Tests gibt es vorerst nicht.

## Considered Options

- **TypeScript mit npm und Rollup, wie Alarmo und browser_mod:** Typen und das übliche Werkzeug, aber eine Node-Toolchain, ein Build und ein gebautes Bundle, das committet oder als Release-Zip ausgeliefert werden muss. Für einen kleinen Designer lohnt sich das nicht. Wird er groß genug für TypeScript, ist das Vorbild browser_mod: CI baut und committet das Bundle, Pull Requests enthalten keine Build-Artefakte.
- **Web Components ohne Framework:** Keine Abhängigkeit, aber ein Editor mit Formularen und Live-Vorschau müsste das DOM von Hand nachführen.
- **Preact oder React:** Fremd in HA und umständlicher an HAs Lit-Elemente anzubinden.
- **Browser-Tests mit Playwright gegen das Podman-HA:** Testen das echte Panel, bringen aber npm und Browser in die CI. Auch die Vorschau braucht keinen Browser: Sie entsteht als SVG-Text und wird gegen Golden-Dateien getestet (#42).
