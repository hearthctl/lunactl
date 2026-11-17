# Referenzen und Gerätemaße

Die Referenzdateien liegen nicht im Repo. Die Maße unten stammen aus diesen Fassungen:

| Datei | Quelle | SHA-256 |
|---|---|---|
| `C152-StopWatch-model-size.pdf` | [M5Stack, offizielle Maßzeichnung](https://m5stack-doc.oss-cn-shenzhen.aliyuncs.com/1242/C152-StopWatch-model-size.pdf) | `070dd39ce1ec49afc7e8315605571a97e0774a5452cbdeb91aa05542425efc2c` |
| `StopWatch.stl` | [m5stack/M5_Hardware, C152_StopWatch/Structures](https://github.com/m5stack/M5_Hardware/tree/master/Products/C152_StopWatch/Structures) | `48b292c76f929acb75868cba47ccda86800fbff7cfff172161df64ff87f220d5` |
| `StopWatch_RealReverse.STEP` | [kawacci/m5-stopwatch-watch-case](https://github.com/kawacci/m5-stopwatch-watch-case/tree/main/STEP), MIT | `d0d8718a14824b74f7c3221b210e6db5db836203e4b2119354c2c623ea879752` |

Das Kawacci-STEP ist laut dessen README aus der offiziellen STL nachgebaut und daher keine
unabhängige Messung.

## Koordinaten des Geräts

In der offiziellen STL ist X die Dicke (X = 0 ist die erhabene Rückfläche, die Front zeigt nach
+X), die USB‑C-Buchse liegt bei −Y, Z läuft quer. Die STL enthält das Gehäuse zweimal
(Explosionsdarstellung); gemessen wurde die Kopie um den Ursprung.

## Maße

| Merkmal | Wert | Quelle |
|---|---:|---|
| Gehäusedurchmesser | 51,95 mm | Zeichnung; STL 51,946 mm |
| Dicke Rückfläche bis Glas | 15,5 mm | Zeichnung |
| Dicke des Gehäuses ohne Glas | 15,0 mm | STL |
| Glasdurchmesser, Glas 0,5 mm vor dem Gehäuse | 49,0 mm | nur Kawacci-STEP, am Gerät nicht bestätigt |
| Gehäuseradius hinten (X = 2) bis vorn (X = 14) | 25,66 bis 25,97 mm | STL, Entformungsschräge |
| USB‑C-Öffnung im Gehäuse, Breite × Höhe | 9,07 × 3,29 mm | STL, Schnitt Y = −25,0 |
| Mitte der Öffnung über der Rückfläche | 8,62 mm (Öffnung von 6,97 bis 10,27 mm) | STL |
| Mitte der Öffnung zur Mittellinie | 0,000 mm | STL |
| Plane Fläche um die Öffnung, Abstand zur Gerätemitte | 25,03 mm, von X = 6,50 bis 10,76 mm | STL, Schnitt Z = 0 |
| Gehäusewand an der Öffnung | 1,1 mm | STL |
| Ein-/Aus-Taster, Winkel ab der Buchse | 32,7° bis 57,3°, steht 0,63 mm über | STL |
| Gegenüber auf der anderen Seite der Buchse | Grove-Anschluss | STL, Zeichnung |
| Tasten A und B, oben links und rechts | stehen 1,73 mm über, größte Breite ±21,7 mm | STL |
| Lautsprecher | Rückseite oben, Vertiefung ab 10 mm über der Mitte, bis ±10,5 mm breit | STL |
| Rückseite unterhalb von Y = −19 | 1,5 bis 1,7 mm zurückgesetzt | STL |
| Rückseitige Schraubpunkte M2 | 40,0 mm Abstand, auf Höhe der Gerätemitte | Zeichnung, STL |

Nicht aus den Dateien ablesbar: wie tief die Metallkante der Buchse hinter der planen
Gehäusefläche sitzt. Die STL enthält nur das Gehäuse.

## Prüfung gegen das Gehäusemodell

`check_device.py` setzt die offizielle STL in die exportierten Haltermeshes und hebt sie
schrittweise 40 mm an. Aufruf (braucht `trimesh`, `scipy`, `rtree`):

```sh
python check_device.py StopWatch.stl ../parts/wandhalter/generated/print/wandhalter_body.stl \
  ../parts/wandhalter/generated/print/wandhalter_carrier.stl 4.0 0.2
```

Die beiden letzten Werte sind `BACK_T` und `BACK_RECESS`.
