const axios = require("axios");
const _ = require("lodash");
const objectsToCSV = require("objects-to-csv");
var argv = require("minimist")(process.argv.slice(2));

const argKeys = ["whoOuId", "malOuId", "user", "pass", "whoURL", "malURL"];

argKeys.forEach(k => {
  if (!_.includes(_.keys(argv), k)) {
    throw new Error(`${k} argument missing`);
  }
});

const fieldFilter =
  ":all,parent[name],!id,!href,!created,!dimensionItem,!lastUpdatedBy,!user,!users,!dataSets,!programs,!lastUpdated,!coordinates,!ancestors,!organisationUnitGroups";

const whoAxios = axios.create({
  baseURL: `http://${argv.user}:${argv.pass}@${argv.whoURL}/api`
});

const malAxios = axios.create({
  baseURL: `http://${argv.user}:${argv.pass}@${argv.malURL}/api`
});

async function runComparison() {
  await fetchOUsById(argv.whoOuId, argv.malOuId);
}

async function fetchOUsById(idWHO, idMAL) {
  try {
    const {
      data: { organisationUnits: whoOUs }
    } = await whoAxios.get(
      `organisationUnits.json?filter=id:eq:${idWHO}&fields=${fieldFilter}`
    );
    const {
      data: { organisationUnits: malOUs }
    } = await malAxios.get(
      `organisationUnits.json?filter=id:in:[${idMAL}]&fields=${fieldFilter}`
    );
    const fullWhoOU = addChildrenNumberToOu(whoOUs[0]);
    const fullMalOU = addChildrenNumberToOu(malOUs[0]);
    const diff = compareOrganisationUnits(fullWhoOU, fullMalOU);
    saveToFiles(diff);
  } catch (e) {
    console.log(e);
  }
}

function compareOrganisationUnits(ouA, ouB) {
  const ouKeys = _.keys(ouA);
  const differences = ouKeys.reduce((acc, key) => {
    const valA = ouA[key];
    const valB = ouB[key];
    if (
      (_.isEqual(valA, valB) && key !== "name" && key !== "numberOfChildren") ||
      key === "children"
    )
      return acc;
    else return { ...acc, [key]: [valA, valB] };
  }, {});
  return differences;
}

async function saveToFiles(diff) {
  console.log(diff);
  const matchedCSV = new objectsToCSV([diff]);
  await matchedCSV.toDisk(`results/unmatched-custom.csv`);
}

function addChildrenNumberToOu(ou) {
  return { ...ou, numberOfChildren: ou.children.length };
}

runComparison();
