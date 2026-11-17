# Wandhalter

3D-druckbare Wandhalterung für die M5Stack StopWatch (C152). Das Gerät wird von oben
eingesetzt und gleitet dabei auf einen USB‑C-Stecker, der fest in der Halterung sitzt.

Zwei Teile:

- **Körper** (`body`): Wandplatte mit zwei Senkbohrungen und ein tropfenförmiger Rand um die
  untere Gerätehälfte. Zwei Anschlagflächen unter dem Gehäuserand tragen das Gerät, der Rand
  mit schräger Frontlippe hält es seitlich und gegen Kippen nach vorn. Der Rand wird nach
  oben dünner und läuft kurz unter der breitesten Stelle des Geräts in dessen Umriss aus;
  darüber steht das Gerät frei. Nach oben hält es allein der Stecker. In der Tropfenspitze
  sitzt der Schacht für die Steckeraufnahme, das Kabel tritt an der Spitze aus.
- **Steckeraufnahme** (`carrier`): klemmt den Stecker seitlich, stützt ihn an der hinteren
  Schulter ab und hält ihn mit einem Riegel vor der Stirnfläche der Umspritzung fest, wenn das
  Gerät herausgezogen wird. Sie wird von der Wandseite in den Körper geschoben; die Wand hält
  sie fest.

Das Gerät liegt auf den Anschlagflächen auf. Die Stirnfläche des Steckers bleibt 1,55 mm
unter dem Gehäuse, die Buchse trägt also keine Last. In diesem Spalt sitzt der Riegel. Display und Tasten A und B bleiben frei,
die Wandplatte ist hinter dem Lautsprecher offen. Ein-/Aus-Taster und Grove-Anschluss liegen
hinter dem Rand und sind im Halter nicht erreichbar; eine Aussparung im Rand hält 1 mm Abstand
zum Taster, damit er nicht gedrückt wird.

## Bauen

Die fertigen Dateien liegen im Repo unter `parts/wandhalter/generated/`: STEP in `cad/`, STL
in `print/`, Zusammenbau und Mittelschnitt als Bild in `images/` und die Druckdatei
`h2d/wandhalter.3mf`. Neu erzeugt werden sie aus dem Repo-Wurzelverzeichnis; `WORKBENCH` zeigt
auf den Checkout der gemeinsamen Werkbank (`b123d-print`, build123d):

```sh
make cad WORKBENCH=...       # bauen, prüfen, STEP gegen requirements/ prüfen
make cad-3mf WORKBENCH=...   # zusätzlich mit Bambu Studio slicen (BAMBU=... falls nicht unter /Applications)
```

Maße ändern, danach neu erzeugen:

```sh
b123d-print --root cad set wandhalter PLUG_W=11.9 PLUG_T=6.3
```

Alle Maße stehen als Parameter in `parts/wandhalter/wandhalter.py`, die Gerätemaße und ihre
Quellen in `ref/README.md`, die Prüfanforderungen in `requirements/`.

## Maße

Der Stecker des Kabels ist gemessen (16.11.2026):

| Parameter | Messen zwischen | Wert |
|---|---|---:|
| `PLUG_W` | den beiden Schmalseiten der Umspritzung | 10,18 mm |
| `PLUG_T` | den beiden Breitseiten der Umspritzung | 4,41 mm |
| `PLUG_L` | Stirnfläche der Umspritzung (dort tritt das Metall aus) und hinterer Schulter | 14,55 mm |
| `PLUG_TIP` | Stirnfläche der Umspritzung und Spitze des Metallsteckers | 6,46 mm |
| `RELIEF_D` | Kabeldurchmesser direkt an der Schulter (kein eigener Knickschutz) | 3,09 mm |
| `PLUG_EDGE` | Rundung der Kanten an der Stirnfläche | nicht gemessen, 0,3 mm angenommen |

Schacht und Tropfenspitze sind auf diesen Stecker zugeschnitten (`BAY_DEPTH`, `CARRIER_W`,
`CARRIER_L`, `TIP_R`, `TIP_ABOVE_FLOOR`). Ein anderes Kabel braucht deshalb in der Regel auch einen
neuen Körper.

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
Wahl: Körper 11,9 g und 29 min, Steckeraufnahme 2,0 g und 12 min. Die
Druckdatei mit beiden Platten ist `parts/wandhalter/generated/h2d/wandhalter.3mf`.

## Zusammenbau

1. Stecker von der offenen Seite in die Steckeraufnahme drücken: Die Umspritzung sitzt
   zwischen Absatz und Riegel, der Metallteil im Schlitz des Riegels.
2. Steckeraufnahme von der Wandseite in den Körper schieben, Kabel nach unten herausführen.
3. Körper mit zwei Schrauben an die Wand schrauben.

## Stand

Körper und Steckeraufnahme sind gedruckt und im Einsatz: Das Gerät lädt, der Stecker bleibt
beim Herausziehen in der Aufnahme, und der Rand schließt bündig mit dem Glas ab. Nach oben
hält allein die Rastung der USB‑C-Buchse; wie sich das über viele Steckzyklen verhält, ist
offen.
