# Wandhalter

3D-druckbare Wandhalterung für die M5Stack StopWatch (C152). Das Gerät wird von oben
eingesetzt und gleitet dabei auf einen USB‑C-Stecker, der fest in der Halterung sitzt.

Ein Körper und je Stecker eine Steckeraufnahme:

- **Körper** (`body`): Wandplatte mit zwei Senkbohrungen und ein tropfenförmiger Rand um die
  untere Gerätehälfte. Zwei Anschlagflächen unter dem Gehäuserand tragen das Gerät, der Rand
  mit schräger Frontlippe hält es seitlich und gegen Kippen nach vorn. Der Rand wird nach
  oben dünner und läuft kurz unter der breitesten Stelle des Geräts in dessen Umriss aus;
  darüber steht das Gerät frei. Nach oben hält es allein der Stecker. In der Tropfenspitze
  sitzt der Schacht für die Steckeraufnahme, das Kabel tritt an der Spitze aus.
- **Steckeraufnahme** (`carrier`): klemmt den Stecker seitlich, stützt ihn an der hinteren
  Schulter ab und hält ihn mit einem Riegel vor der Stirnfläche der Umspritzung fest, wenn das
  Gerät herausgezogen wird. Sie wird von der Wandseite in den Körper geschoben; die Wand hält
  sie fest. Alle Aufnahmen haben dieselbe Außenform und passen in denselben Körper, nur die
  Tasche für den Stecker unterscheidet sich. Es gibt eine für den Apple-Stecker (`carrier`) und
  eine für den größeren Stecker `xl` (`xl_carrier`).

Das Gerät liegt auf den Anschlagflächen auf. Die Stirnfläche des Steckers bleibt 1,55 mm
unter dem Gehäuse, die Buchse trägt also keine Last. In diesem Spalt sitzt der Riegel. Display und Tasten A und B bleiben frei,
die Wandplatte ist hinter dem Lautsprecher offen. Ein-/Aus-Taster und Grove-Anschluss liegen
hinter dem Rand und sind im Halter nicht erreichbar; eine Aussparung im Rand hält 1 mm Abstand
zum Taster, damit er nicht gedrückt wird.

## Bauen

Die fertigen Dateien liegen im Repo unter `parts/wandhalter/generated/`: STEP in `cad/`, STL
in `print/`, Zusammenbau und Mittelschnitt je Stecker als Bild in `images/` (`wandhalter_xl_*`
für den Stecker `xl`) und die Druckdatei `h2d/wandhalter.3mf`. Der Körper ist in jeder Variante
derselbe und liegt deshalb nur einmal vor; `make cad` bricht ab, falls eine Variante ihn ändert. Neu erzeugt werden sie aus dem Repo-Wurzelverzeichnis; `WORKBENCH` zeigt
auf den Checkout der gemeinsamen Werkbank (`b123d-print`, build123d):

```sh
make cad WORKBENCH=...       # bauen, prüfen, STEP gegen requirements/ prüfen
make cad-3mf WORKBENCH=...   # zusätzlich mit Bambu Studio slicen (BAMBU=... falls nicht unter /Applications)
```

Maße ändern, danach neu erzeugen:

```sh
b123d-print --root cad set wandhalter PLUG_W=11.9 PLUG_T=6.3
b123d-print --root cad set wandhalter --variant xl PLUG_W=11.9   # Maß eines anderen Steckers
```

Alle Maße stehen als Parameter in `parts/wandhalter/wandhalter.py`, die Gerätemaße und ihre
Quellen in `ref/README.md`, die Prüfanforderungen in `requirements/`.

## Maße

Der Apple-Stecker (Standardvariante) ist gemessen (16.11.2026):

| Parameter | Messen zwischen | Wert |
|---|---|---:|
| `PLUG_W` | den beiden Schmalseiten der Umspritzung | 10,18 mm |
| `PLUG_T` | den beiden Breitseiten der Umspritzung | 4,41 mm |
| `PLUG_L` | Stirnfläche der Umspritzung (dort tritt das Metall aus) und hinterer Schulter | 14,55 mm |
| `PLUG_TIP` | Stirnfläche der Umspritzung und Spitze des Metallsteckers | 6,46 mm |
| `RELIEF_D` | Kabeldurchmesser direkt an der Schulter (kein eigener Knickschutz) | 3,09 mm |
| `PLUG_EDGE` | Rundung der Kanten an der Stirnfläche | nicht gemessen, 0,3 mm angenommen |

## Steckervarianten

Jeder Stecker ist eine Variante in `VARIANTS` in `parts/wandhalter/wandhalter.py` und überschreibt
nur `PLUG_W`, `PLUG_T`, `PLUG_L` und `RELIEF_D`. Die Metallspitze ist bei beiden nach USB‑C-Norm.
Eckenradien sind nicht gemessen; die Tasche hat scharfe Ecken, ein Stecker mit gerundeten Ecken
passt also immer.

| Parameter | Apple (Standard) | `xl` (gemessen 22.11.2026) |
|---|---:|---:|
| `PLUG_W` | 10,18 mm | 11,78 mm |
| `PLUG_T` | 4,41 mm | 6,42 mm |
| `PLUG_L` | 14,55 mm | 19,16 mm |
| `RELIEF_D` | 3,09 mm | 5,7 mm |

Schacht und Tropfenspitze sind für den größten Stecker (`xl`) ausgelegt (`CARRIER_W`,
`CARRIER_L`, `BAY_DEPTH`, `CABLE_MAX_D`, `TIP_R`, `TIP_ABOVE_FLOOR`); der Körper liest
von den Steckermaßen nur die Metallspitze, die bei allen gleich ist. Ein Stecker passt in diese
Außenform, solange er nicht breiter als 11,79 mm, nicht dicker als 6,45 mm, nicht länger als
19,54 mm ist und das Kabel höchstens 5,7 mm misst. Sonst bricht `Dims` ab und der Körper muss neu
ausgelegt werden.

Einen weiteren Stecker ergänzen:

1. Eine Variante in `VARIANTS` eintragen.
2. Den Namen in `CAD_VARIANTS` im Makefile eintragen.
3. `requirements/carrier_<name>.json` aus der `xl`-Variante ableiten und in `plates.json`
   eine Platte für `generated/print/wandhalter_<name>_carrier.stl` ergänzen.

Am Gerät aus den Gehäusedateien übernommen, nicht nachgemessen:

| Parameter | Messen zwischen | Wert |
|---|---|---:|
| `USB_BACK` | erhabener Rückfläche und hinterer Kante der USB‑C-Öffnung, plus halbe Öffnungshöhe | 6,97 + 1,65 = 8,62 mm |
| `DEV_T` | erhabener Rückfläche und Glas | 15,5 mm |
| `DEV_D` | Gehäuserand quer, auf Höhe der Gerätemitte, nahe der Front | 51,95 mm |
| (kein Parameter) | planer Gehäusefläche um die Öffnung und Metallkante der Buchse, mit dem Tiefenmaß | unbekannt |

Das letzte Maß entscheidet, wie tief der Stecker eintaucht: ab der Gehäusefläche sind es
`PLUG_TIP` minus Riegelstärke minus 0,35 mm Luft, abzüglich dieses Rücksprungs. Voll gesteckt
wären etwa 6,2 mm.

Der Riegel ist 1,2 mm stark (`LATCH_T`), der Stecker taucht damit 4,91 mm ein. Mit diesem
Maß lädt das Gerät und der Stecker bleibt beim Herausziehen in der Aufnahme.

Der Auslauf des Rands lässt sich über drei Parameter einstellen:

| Parameter | Wirkung | Wert |
|---|---|---:|
| `RIM_R` | Radius des Kreises, der den Rand außen begrenzt | 27,25 mm |
| `RIM_DROP` | Dieser Kreis liegt so weit unter der Gerätemitte; mehr Versatz heißt stärkerer Verlauf der Wandstärke | 4,5 mm |
| `RIM_END` | Der Rand endet so weit unter der breitesten Stelle des Geräts | 5° |

An den Enden bleibt 1,0 mm Wand, außen an der Aussparung für den Ein-/Aus-Taster mindestens
1,4 mm.

Der Rand endet bündig mit dem Glas. Die Frontlippe greift dafür nur 0,7 mm über die
Gehäusekante, ist an der Innenkante 0,4 mm dick und steigt mit 51° Überhang
(`LIP_R`, `LIP_EDGE`, `LIP_SLOPE`). Zur gerundeten Gehäuseschulter bleiben rechnerisch
0,13 bis 0,18 mm.

Für die Wandschrauben sind 4‑mm-Senkkopfschrauben angenommen (`SCREW_HOLE_D`, `SCREW_HEAD_D`).

## Druck

Bambu Lab H2D, 0,4‑mm-Düse, 0,20 mm Standard, ohne Stützen. Körper mit der Wandseite auf dem
Bett, Steckeraufnahme mit der Rückseite auf dem Bett. Geslict mit PLA Basic als vorläufiger
Wahl: Körper 12,9 g und 30 min, Steckeraufnahme für Apple 2,7 g und 13 min, für `xl` 2,6 g und
13 min. Die Druckdatei mit den drei Platten ist `parts/wandhalter/generated/h2d/wandhalter.3mf`.
Das Dach des Schachts überbrückt jetzt 18 mm statt 16,4 mm.

## Zusammenbau

1. Stecker von der offenen Seite in die zu ihm passende Steckeraufnahme drücken: Die Umspritzung sitzt
   zwischen Absatz und Riegel, der Metallteil im Schlitz des Riegels.
2. Steckeraufnahme von der Wandseite in den Körper schieben, Kabel nach unten herausführen.
3. Körper mit zwei Schrauben an die Wand schrauben.

## Stand

Der Körper in der jetzigen Größe und die beiden Aufnahmen sind nur gerechnet, geprüft und
gesliced, aber noch nicht gedruckt. Ein früherer, kleinerer Stand von Körper und Aufnahme für den
Apple-Stecker ist gedruckt und im Einsatz: Das Gerät lädt, der Stecker bleibt
beim Herausziehen in der Aufnahme, und der Rand schließt bündig mit dem Glas ab. Nach oben
hält allein die Rastung der USB‑C-Buchse; wie sich das über viele Steckzyklen verhält, ist
offen.
