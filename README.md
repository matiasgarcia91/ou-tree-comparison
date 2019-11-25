## Organisation-unit comparison script for DHIS 2.30

To run:

```
node ouCompare.js --whoURL=urlWHOInstance --malURL=urlMalInstance --user=user.name --pass=password --whoRoot=rootOuIdWHO --malRoot=rootOuIdMalaria
```

For example for WHO and Malaria instances running on docker containers de command would be:

```
node ouCompare.js --whoURL=localhost:8081 --malURL=localhost:8080 --user=user.name --pass=password --whoRoot=H8RixfF8ugH --malRoot=tj59TOvhhDA
```

Script `ouCompare.js` starts from the selected root in both trees and tries to match OUs by their name to form pairs. For each level it outputs two files: `matched-ous-levelN.csv` and `unmatched-ous-levelN.csv`. These contain a raw comparison of the most important attributes OUs have.

IMPORTANT: Organisation Units selected as roots don't necessarly have to be at the same level. This is the case in the malaria tree which contains a copy of the whole OU tree nested inside. In that case you can give the script the WHO root at level 1 and the secondary Malaria root at level 3 (or 4?).

Script `oneVoneCompare.js` does the same comparison but for only two organisation units. Used to match `unmatched` OUs by hand.
