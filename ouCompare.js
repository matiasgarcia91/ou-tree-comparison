const axios = require("axios");
const _ = require("lodash");
const objectsToCSV = require("objects-to-csv");
var argv = require("minimist")(process.argv.slice(2));

const argKeys = ["whoRoot", "malRoot", "whoURL", "malURL", "user", "pass", "whoViews", "malViews"];

argKeys.forEach(k => {
  if (!_.includes(_.keys(argv), k)) {
    throw new Error(`${k} argument missing`);
  }
});

const fieldFilter =
  ":all,parent[name],children[id,name],!href,!created,!dimensionItem,!lastUpdatedBy,!user,!users,!dataSets,!programs,!lastUpdated,!coordinates,!ancestors,!organisationUnitGroups";

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
const WHO_VIEWS = JSON.parse(argv.whoViews);
const MAL_VIEWS = JSON.parse(argv.malViews);

let whoDataValuesByOu = { dataValues: {}, trackedEntityInstances: {}, programStageInstances: {}, childDV: {}, childTEI: {}, childPSI:{}};
let malDataValuesByOu = { dataValues: {}, trackedEntityInstances: {}, programStageInstances: {}, childDV: {}, childTEI: {}, childPSI:{}};
let whoOrgUnitTree = {};
let malOrgUnitTree = {};

async function runComparison() {
  await fetchDataCounts();
  await fetchOUsById([WHO_ROOT_OU], [MAL_ROOT_OU], 1);
  setTimeout(saveToFiles, 5000);
}


async function fetchDataCounts() {
  try {
    const {
      data: {listGrid: {rows: whoRawDataValues} }
    } = await whoAxios.get(`sqlViews/${WHO_VIEWS[0]}/data.json?paging=false`);
    const {
      data: {listGrid: {rows: malRawDataValues} }
    } = await malAxios.get(`sqlViews/${MAL_VIEWS[0]}/data.json?paging=false`);
    const {
      data: {listGrid: {rows: whoRawProgramStageInstances} }
    } = await whoAxios.get(`sqlViews/${WHO_VIEWS[1]}/data.json?paging=false`);
    const {
      data: {listGrid: {rows: malRawProgramStageInstances} }
    } = await malAxios.get(`sqlViews/${MAL_VIEWS[1]}/data.json?paging=false`);
    const {
      data: {listGrid: {rows: whoRawTrackedEntityInstances} }
    } = await whoAxios.get(`sqlViews/${WHO_VIEWS[2]}/data.json?paging=false`);
    const {
      data: {listGrid: {rows: malRawTrackedEntityInstances} }
    } = await malAxios.get(`sqlViews/${MAL_VIEWS[2]}/data.json?paging=false`);
    whoRawDataValues.forEach(x => whoDataValuesByOu.dataValues[x[0]] = x[1]);
    malRawDataValues.forEach(x => malDataValuesByOu.dataValues[x[0]] = x[1]);
    whoRawProgramStageInstances.forEach(x => whoDataValuesByOu.programStageInstances[x[0]] = x[1]);
    malRawProgramStageInstances.forEach(x => malDataValuesByOu.programStageInstances[x[0]] = x[1]);
    whoRawTrackedEntityInstances.forEach(x => whoDataValuesByOu.trackedEntityInstances[x[0]] = x[1]);
    malRawTrackedEntityInstances.forEach(x => malDataValuesByOu.trackedEntityInstances[x[0]] = x[1]);
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
      await fetchOUsById(whoChildrenIds, malChildrenIds, 2);
      const whoRoot = addChildrenNumberToOu(whoOUs[0], whoOrgUnitTree);
      const malRoot = addChildrenNumberToOu(malOUs[0], malOrgUnitTree);
      compareOrganisationUnits([whoRoot, malRoot], 1);
    }
    var match_result = await matchAndCompare(whoOUs, malOUs, level)
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
      const ouCustom = addChildrenNumberToOu(ou, whoOrgUnitTree);
      if (match) {
        const matchCustom = addChildrenNumberToOu(match, malOrgUnitTree);
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
      const ouCustom = addChildrenNumberToOu(ou, malOrgUnitTree);
      if (match) {
        const matchCustom = addChildrenNumberToOu(match, whoOrgUnitTree);
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
async function updateDataValues() {
  _.keys(resultAccum).reverse().forEach(level => {
    resultAccum[level].forEach(pair => {
      whoId = pair.id[0];
      malId = pair.id[1];
      if (!_.isEmpty(whoOrgUnitTree[whoId])) {
        whoOrgUnitTree[whoId].forEach(child => incrementOUDataValues(whoId, child, whoDataValuesByOu));
      } else {
        initialize_count(whoId, whoDataValuesByOu)
      }
      if (!_.isEmpty(malOrgUnitTree[malId])) {
        malOrgUnitTree[malId].forEach(child => incrementOUDataValues(malId, child, malDataValuesByOu));
      } else {
        initialize_count(malId, malDataValuesByOu)
      }
      pair.dataValues = [whoDataValuesByOu.dataValues[whoId] - whoDataValuesByOu.childDV[whoId], malDataValuesByOu.dataValues[malId] - malDataValuesByOu.childDV[malId]];
      pair.programStageInstances = [whoDataValuesByOu.programStageInstances[whoId] - whoDataValuesByOu.childPSI[whoId], malDataValuesByOu.programStageInstances[malId] - malDataValuesByOu.childPSI[malId]];
      pair.trackedEntityInstances = [whoDataValuesByOu.trackedEntityInstances[whoId] - whoDataValuesByOu.childTEI[whoId], malDataValuesByOu.trackedEntityInstances[malId] - malDataValuesByOu.childTEI[malId]];
      pair.childrenDataValues = [whoDataValuesByOu.childDV[whoId], malDataValuesByOu.childDV[malId]];
      pair.childrenProgramStageInstances = [whoDataValuesByOu.childPSI[whoId], malDataValuesByOu.childPSI[malId]];
      pair.childrenTrackedEntityInstances = [whoDataValuesByOu.childTEI[whoId], malDataValuesByOu.childTEI[malId]];
    });
  });
  _.keys(unmatched).reverse().forEach(level => {
    unmatched[level].forEach(ou => {
     if (whoOrgUnitTree.hasOwnProperty(ou.id)){
       if (!_.isEmpty(whoOrgUnitTree[ou.id])) {
         whoOrgUnitTree[ou.id].forEach(child => incrementOUDataValues(ou.id, child, whoDataValuesByOu));
       } else {
         initialize_count(ou.id, whoDataValuesByOu)
       }
       ou.dataValues = whoDataValuesByOu.dataValues[ou.id] - whoDataValuesByOu.childDV[ou.id];
       ou.programStageInstances = whoDataValuesByOu.programStageInstances[ou.id] - whoDataValuesByOu.childPSI[ou.id];
       ou.trackedEntityInstances = whoDataValuesByOu.trackedEntityInstances[ou.id] - whoDataValuesByOu.childTEI[ou.id];
       ou.childrenDataValues = whoDataValuesByOu.childDV[ou.id];
       ou.childrenProgramStageInstances = whoDataValuesByOu.childPSI[ou.id];
       ou.childrenTrackedEntityInstances = whoDataValuesByOu.childTEI[ou.id];
     } else {
       if (!_.isEmpty(malOrgUnitTree[ou.id])) {
         malOrgUnitTree[ou.id].forEach(child => incrementOUDataValues(ou.id, child, malDataValuesByOu));
       } else {
         initialize_count(ou.id, malDataValuesByOu)
       }
       ou.dataValues = malDataValuesByOu.dataValues[ou.id] - malDataValuesByOu.childDV[ou.id];
       ou.programStageInstances = malDataValuesByOu.programStageInstances[ou.id] - malDataValuesByOu.childPSI[ou.id];
       ou.trackedEntityInstances = malDataValuesByOu.trackedEntityInstances[ou.id] - malDataValuesByOu.childTEI[ou.id];
       ou.childrenDataValues = malDataValuesByOu.childDV[ou.id];
       ou.childrenProgramStageInstances = malDataValuesByOu.childPSI[ou.id];
       ou.childrenTrackedEntityInstances = malDataValuesByOu.childTEI[ou.id];
     }
    });
  });
}

async function addDataValuesCount() {
  _.keys(resultAccum).forEach(level => {
    resultAccum[level].forEach(pair => {
      whoId = pair.id[0];
      malId = pair.id[1];
      pair.dataValues = [whoDataValuesByOu.dataValues[whoId], malDataValuesByOu.dataValues[malId]];
      pair.programStageInstances = [whoDataValuesByOu.programStageInstances[whoId], malDataValuesByOu.programStageInstances[malId]];
      pair.trackedEntityInstances = [whoDataValuesByOu.trackedEntityInstances[whoId], malDataValuesByOu.trackedEntityInstances[malId]];
    })
  });
  _.keys(unmatched).forEach(level => {
    unmatched[level].forEach(ou => {
      if (whoOrgUnitTree.hasOwnProperty(ou.id)){
        ou.dataValues = whoDataValuesByOu.dataValues[ou.id];
        ou.programStageInstances = whoDataValuesByOu.programStageInstances[ou.id];
        ou.trackedEntityInstances = whoDataValuesByOu.trackedEntityInstances[ou.id];
      } else {
        ou.dataValues = malDataValuesByOu.dataValues[ou.id];
        ou.programStageInstances = malDataValuesByOu.programStageInstances[ou.id];
        ou.trackedEntityInstances = malDataValuesByOu.trackedEntityInstances[ou.id];
      }
    })
  });
}

async function saveToFiles() {
  await updateDataValues();
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

function addChildrenNumberToOu(ou, sourceTree) {
  if (!_.isEmpty(ou.children)) {
    sourceTree[ou.id] = _.map(ou.children, "id");
  }
  return {
    ...ou,
    numberOfChildren: ou.children.length
  };
}

function incrementOUDataValues(ou, child, source) {
  source.childDV[ou] = _.get(source.childDV, ou, 0) + _.get(source.dataValues, child, 0);
  source.childPSI[ou] = _.get(source.childPSI, ou, 0) + _.get(source.programStageInstances, child, 0);
  source.childTEI[ou] = _.get(source.childTEI, ou, 0) + _.get(source.trackedEntityInstances, child, 0);

  source.dataValues[ou] = _.get(source.dataValues, ou, 0) + _.get(source.dataValues, child, 0);
  source.programStageInstances[ou] = _.get(source.programStageInstances, ou, 0) + _.get(source.programStageInstances, child, 0);
  source.trackedEntityInstances[ou] = _.get(source.trackedEntityInstances, ou, 0) + _.get(source.trackedEntityInstances, child, 0);
}

function initialize_count(ou, source) {
  source.childDV[ou] = 0;
  source.childPSI[ou] = 0;
  source.childTEI[ou] = 0;

  source.dataValues[ou] = _.get(source.dataValues, ou, 0);
  source.programStageInstances[ou] = _.get(source.programStageInstances, ou, 0);
  source.trackedEntityInstances[ou] = _.get(source.trackedEntityInstances, ou, 0);
}

runComparison();
