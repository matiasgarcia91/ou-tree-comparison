const axios = require("axios");
const _ = require("lodash");
const objectsToCSV = require("objects-to-csv");
var argv = require("minimist")(process.argv.slice(2));
console.log(argv);

const argKeys = ["whoRoot", "malRoot", "whoURL", "malURL", "user", "pass"];

argKeys.forEach(k => {
  if (!_.includes(_.keys(argv), k)) {
    throw new Error(`${k} argument missing`);
  }
});

const fieldFilter =
  ":all,parent[name],!id,!href,!created,!path,!dimensionItem,!lastUpdatedBy,!user,!users,!dataSets,!programs,!lastUpdated,!coordinates,!ancestors,!organisationUnitGroups";

const whoAxios = axios.create({
  baseURL: `http://${argv.user}:${argv.pass}@${argv.whoURL}/api`
});

const malAxios = axios.create({
  baseURL: `http://${argv.user}:${argv.pass}@${argv.malURL}/api`
});

const WHO_ROOT_OU = argv.whoRoot;
const MAL_ROOT_OU = argv.malRoot;
const MAX_DEPTH = 4;
const STARTING_LEVEL = 2;
let unmatched = { 1: [], 2: [], 3: [], 4: [] };
let resultAccum = { 1: [], 2: [], 3: [], 4: [] };

async function runComparison() {
  await fetchOUsById([WHO_ROOT_OU], [MAL_ROOT_OU], 1);
  setTimeout(saveToFiles, 4000);
  console.log("HOLA!!");
}

async function fetchOUsById(idsWHO, idsMAL, level = 1) {
  //if (level !== 1) console.log(`currentLevenl ${level}`);
  const whoIds = idsWHO.length > 1 ? idsWHO.join(",") : idsWHO[0];
  const malIds = idsMAL.length > 1 ? idsMAL.join(",") : idsMAL[0];
  //if (level !== 1) console.log({ whoIds, malIds });
  try {
    const {
      data: { organisationUnits: whoOUs }
    } = await whoAxios.get(
      `organisationUnits.json?filter=id:in:[${whoIds}]&fields=${fieldFilter}`
    );
    const {
      data: { organisationUnits: malOUs }
    } = await malAxios.get(
      `organisationUnits.json?filter=id:in:[${malIds}]&fields=${fieldFilter}`
    );
    if (level === 1) {
      //console.log("nivel1");
      const whoChildrenIds = _.map(whoOUs[0].children, "id");
      const malChildrenIds = _.map(malOUs[0].children, "id");
      await fetchOUsById(whoChildrenIds, malChildrenIds, 2);
    }
    await matchAndCompare(whoOUs, malOUs, level);
    //console.log({ a: unmatched["3"] });
  } catch (e) {
    console.log(e);
  }
}

async function matchAndCompare(whoOUs, malOUs, level) {
  const matchedOUs = matchOUs(whoOUs, malOUs, level);
  matchedOUs.matched.forEach(async pair => {
    compareOrganisationUnits(pair, level);
    if (
      level < MAX_DEPTH &&
      !_.isEmpty(pair[0].children) &&
      !_.isEmpty(pair[1].children)
    ) {
      await fetchOUsById(
        _.map(pair[0].children, "id"),
        _.map(pair[1].children, "id"),
        level + 1
      );
    }
  });
}

function matchOUs(ouListWHO, ouListMAL, level) {
  let result = { matched: [], unmatched: [] };
  const baseLists =
    level === 2
      ? { names: ouListWHO, matches: ouListMAL }
      : { names: ouListMAL, matches: ouListWHO };
  baseLists.names.forEach(ou => {
    const name = ou.name;
    const match = _.find(baseLists.matches, toMatch =>
      toMatch.name.includes(name)
    );
    if (match) {
      result = { ...result, matched: [...result.matched, [ou, match]] };
    } else {
      result = { ...result, unmatched: [...result.unmatched, ou] };
      //console.log({ level });
      unmatched = { ...unmatched, [level]: [...unmatched[level], ou] };
    }
  });
  return result;
}

function compareOrganisationUnits(ouPair, level) {
  const ouWHO = ouPair[0];
  const ouMAL = ouPair[1];
  const ouKeys = _.keys(ouWHO);
  const differences = ouKeys.reduce((acc, key) => {
    const valA = ouWHO[key];
    const valB = ouMAL[key];
    //if (!_.isString(valA) || !_.isString(valB)) return { [key]: "NOT STRINGS" };
    if ((_.isEqual(valA, valB) && key !== "name") || key === "children")
      return acc;
    else return { ...acc, [key]: [valA, valB] };
  }, {});
  resultAccum = {
    ...resultAccum,
    [level]: [...resultAccum[level], differences]
  };
  console.log({
    matches: resultAccum["3"].length,
    unmatched: unmatched["3"].length
  });
  //console.log(differences);
}

async function saveToFiles() {
  _.keys(resultAccum).forEach(async level => {
    const sortedOUs = _.sortBy(resultAccum[level], diff => _.keys(diff).length);
    const matchedCSV = new objectsToCSV(sortedOUs.reverse());
    await matchedCSV.toDisk(`results/matched-ous-level${level}.csv`);
    //const unmatchedCSV = new objectsToCSV(unmatched[level]);
  });
}

runComparison();
