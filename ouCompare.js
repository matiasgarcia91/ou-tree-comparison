const axios = require("axios");
const _ = require("lodash");
const objectsToCSV = require("objects-to-csv");
var argv = require("minimist")(process.argv.slice(2));

const argKeys = ["whoRoot", "malRoot", "whoURL", "malURL", "user", "pass"];

argKeys.forEach(k => {
  if (!_.includes(_.keys(argv), k)) {
    throw new Error(`${k} argument missing`);
  }
});

const fieldFilter =
  ":all,parent[name],children[id,name],!id,!href,!created,!dimensionItem,!lastUpdatedBy,!user,!users,!dataSets,!programs,!lastUpdated,!coordinates,!ancestors,!organisationUnitGroups";

const whoAxios = axios.create({
  baseURL: `http://${argv.user}:${argv.pass}@${argv.whoURL}/api`
});

const malAxios = axios.create({
  baseURL: `http://${argv.user}:${argv.pass}@${argv.malURL}/api`
});

const WHO_ROOT_OU = argv.whoRoot;
const MAL_ROOT_OU = argv.malRoot;
const MAX_DEPTH = 4;
let unmatched = { 1: [], 2: [], 3: [], 4: [] };
let resultAccum = { 1: [], 2: [], 3: [], 4: [] };
let whoDataValuesByOu = { dataValues: {}, trackedEntityInstances: {}, programStageInstances: {}};
let malDataValuesByOu = { dataValues: {}, trackedEntityInstances: {}, programStageInstances: {}};

async function runComparison() {
  await fetchDataCounts();
  await fetchOUsById([WHO_ROOT_OU], [MAL_ROOT_OU], 1);
  setTimeout(saveToFiles, 4000);
}

function lookup(data) {
  whoDataValuesByOu.dataValues[data[0]] = data[1];
}

async function fetchDataCounts() {
  try {
    const {
      data: {listGrid: {rows: whoRawDataValues} }
    } = await whoAxios.get(`sqlViews/UaXWNBvpkJ3/data?paging=false`);
    const {
      data: {listGrid: {rows: malRawDataValues} }
    } = await whoAxios.get(`sqlViews/GGxsaAHqDlJ/data?paging=false`);
    whoRawDataValues.forEach(x => whoDataValuesByOu.dataValues[x[0]] = x[1]);
    malRawDataValues.forEach(x => malDataValuesByOu.dataValues[x[0]] = x[1]);
    console.log(whoDataValuesByOu)
  } catch (e) {
    console.log(e)
  }
}

async function fetchOUsById(idsWHO, idsMAL, level = 1) {
  const whoIds = idsWHO.length > 1 ? idsWHO.join(",") : idsWHO[0];
  const malIds = idsMAL.length > 1 ? idsMAL.join(",") : idsMAL[0];
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
      const whoChildrenIds = _.map(whoOUs[0].children, "id");
      const malChildrenIds = _.map(malOUs[0].children, "id");
      const whoRoot = addChildrenNumberToOu(whoOUs[0]);
      const malRoot = addChildrenNumberToOu(malOUs[0]);
      compareOrganisationUnits([whoRoot, malRoot], 1);
      await fetchOUsById(whoChildrenIds, malChildrenIds, 2);
    }
    await matchAndCompare(whoOUs, malOUs, level);
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
  if (level === 4) {
    const whoNames = _.map(ouListWHO, "name");
    const malNames = _.map(ouListMAL, "name");
    console.log(
      `WHO LEVEL 4 orgUnits parent = ${ouListWHO[0].parent.name}: ${whoNames}`
    );
    console.log(
      `MAL LEVEL 4 orgUnits parent = ${ouListMAL[0].parent.name}: - ${malNames}`
    );
  }
  if (level === 2) {
    ouListWHO.forEach(ou => {
      const name = ou.name;
      const match = _.find(ouListMAL, toMatch => toMatch.name.includes(name));
      const ouCustom = addChildrenNumberToOu(ou);
      if (match) {
        const matchCustom = addChildrenNumberToOu(match);
        result = {
          ...result,
          matched: [...result.matched, [ouCustom, matchCustom]]
        };
      } else {
        result = { ...result, unmatched: [...result.unmatched, ouCustom] };
        unmatched = { ...unmatched, [level]: [...unmatched[level], ouCustom] };
      }
    });
  } else {
    ouListMAL.forEach(ou => {
      const name = ou.name.replace("IR - ", "");
      const match = _.find(ouListWHO, toMatch => toMatch.name.includes(name));
      const ouCustom = addChildrenNumberToOu(ou);
      if (match) {
        const matchCustom = addChildrenNumberToOu(match);
        result = {
          ...result,
          matched: [...result.matched, [matchCustom, ouCustom]]
        };
      } else {
        unmatched = { ...unmatched, [level]: [...unmatched[level], ouCustom] };
      }
    });
  }
  return result;
}

function compareOrganisationUnits(ouPair, level) {
  const ouWHO = ouPair[0];
  const ouMAL = ouPair[1];
  const ouKeys = _.keys(ouWHO);
  const differences = ouKeys.reduce((acc, key) => {
    const valA = ouWHO[key];
    const valB = ouMAL[key];
    if (
      (_.isEqual(valA, valB) && key !== "name" && key !== "numberOfChildren") ||
      key === "children"
    )
      return acc;
    else return { ...acc, [key]: [valA, valB] };
  }, {});
  resultAccum = {
    ...resultAccum,
    [level]: [...resultAccum[level], differences]
  };
}

async function saveToFiles() {
  console.log("Matched by level");
  _.keys(resultAccum).forEach(level =>
    console.log(`${level}: ${resultAccum[level].length}`)
  );
  console.log("Unmatched by level");
  _.keys(unmatched).forEach(level =>
    console.log(`${level}: ${unmatched[level].length}`)
  );
  _.keys(resultAccum).forEach(async level => {
    const sortedOUs = _.sortBy(resultAccum[level], diff => _.keys(diff).length);
    const matchedCSV = new objectsToCSV(sortedOUs.reverse());
    await matchedCSV.toDisk(`results/matched-ous-level${level}.csv`);
  });
  _.keys(unmatched).forEach(async level => {
    const matchedCSV = new objectsToCSV(unmatched[level]);
    await matchedCSV.toDisk(`results/unmatched-ou-level${level}.csv`);
  });
}

function addChildrenNumberToOu(ou) {
  return { ...ou, numberOfChildren: ou.children.length };
}

function incrementOUDataValues(ou, datavalues, trackedEntityInstances, programStageInstances) {
  return {
    ...ou,
    dataValuesCount: ou.hasAttribute(dataValuesCount) ? ou.dataValuesCount + datavalues : datavalues,
    trackedEntitiesInstancesCount: ou.hasAttribute(trackedEntityInstancesCount) ? ou.trackedEntitiesInstancesCount + trackedEntityInstances : trackedEntityInstances,
    programStageInstancesCount: ou.hasAttribute(programStageInstancesCount) ? ou.programStageInstancesCount + programStageInstances : programStageInstances
  }
}

runComparison();
