#!/bin/bash
## curl-basic-auth
## - http basic authenication example using
##   curl in bash
## version 0.0.1
##################################################
init_variables() {
	export USER=widp.admin
	export WHOURL=localhost:8080
	export MALURL=localhost:8081
	export WHOROOT=H8RixfF8ugH
	export MALROOT=tj59TOvhhDA
}
post_who_sql_views() {
  echo "Adding SQL views to WHO instance"
  instance=$WHOURL
  RESULT=$(curl -X POST -u $USER:$PASSWORD -H "Content-Type: application/json" $instance/api/sqlViews -d @./sql_views/dataValuesByOU.json)
  echo $RESULT
  RESULT_CODE=$(echo $RESULT | jq -r '.httpStatusCode')
  if [ $RESULT_CODE == 201 ]; then
    echo "Data values sql view created."
    export WHO_DV=$(echo $RESULT | jq -r '.response.uid')
  elif [ $RESULT_CODE == 409 ]; then
      export WHO_DV=$(echo $RESULT | jq -r '.response.errorReports[0].mainId')
  fi
  RESULT=$(curl -X POST -u $USER:$PASSWORD -H "Content-Type: application/json" $instance/api/sqlViews -d @./sql_views/programStageInstancesByOU.json)
  echo $RESULT
  RESULT_CODE=$(echo $RESULT | jq -r '.httpStatusCode')
  if [ $RESULT_CODE == 201 ]; then
    echo "Program stage instances sql view created."
    export WHO_PSI=$(echo $RESULT | jq -r '.response.uid')
  elif [ $RESULT_CODE == 409 ]; then
      export WHO_PSI=$(echo $RESULT | jq -r '.response.errorReports[0].mainId')
  fi
  RESULT=$(curl -X POST -u $USER:$PASSWORD -H "Content-Type: application/json" $instance/api/sqlViews -d @./sql_views/trackedEntityInstancesByOU.json)
  echo $RESULT
  RESULT_CODE=$(echo $RESULT | jq -r '.httpStatusCode')
  if [ $RESULT_CODE == 201 ]; then
    echo "Trackend entity instances sql view created."
    export WHO_TEI=$(echo $RESULT | jq -r '.response.uid')
  elif [ $RESULT_CODE == 409 ]; then
      export WHO_TEI=$(echo $RESULT | jq -r '.response.errorReports[0].mainId')
  fi
}

post_mal_sql_views() {
  echo "Adding SQL views to MAL instance"
  instance=$MALURL
  RESULT=$(curl -X POST -u $USER:$PASSWORD -H "Content-Type: application/json" $instance/api/sqlViews -d @./sql_views/dataValuesByOU.json)
  echo $RESULT
  RESULT_CODE=$(echo $RESULT | jq -r '.httpStatusCode')
  if [ $RESULT_CODE == 201 ]; then
    echo "Data values sql view created."
    export MAL_DV=$(echo $RESULT | jq -r '.response.uid')
  elif [ $RESULT_CODE == 409 ]; then
      export MAL_DV=$(echo $RESULT | jq -r '.response.errorReports[0].mainId')
  fi
  RESULT=$(curl -X POST -u $USER:$PASSWORD -H "Content-Type: application/json" $instance/api/sqlViews -d @./sql_views/programStageInstancesByOU.json)
  echo $RESULT
  RESULT_CODE=$(echo $RESULT | jq -r '.httpStatusCode')
  if [ $RESULT_CODE == 201 ]; then
    echo "Program stage instances sql view created."
    export MAL_PSI=$(echo $RESULT | jq -r '.response.uid')
  elif [ $RESULT_CODE == 409 ]; then
      export MAL_PSI=$(echo $RESULT | jq -r '.response.errorReports[0].mainId')
  fi
  RESULT=$(curl -X POST -u $USER:$PASSWORD -H "Content-Type: application/json" $instance/api/sqlViews -d @./sql_views/trackedEntityInstancesByOU.json)
  echo $RESULT
  RESULT_CODE=$(echo $RESULT | jq -r '.httpStatusCode')
  if [ $RESULT_CODE == 201 ]; then
    echo "Trackend entity instances sql view created."
    export MAL_TEI=$(echo $RESULT | jq -r '.response.uid')
  elif [ $RESULT_CODE == 409 ]; then
      export MAL_TEI=$(echo $RESULT | jq -r '.response.errorReports[0].mainId')
  fi
}


run_comparison() {
  echo 'Comparison execution'
  echo $WHO_DV $WHO_PSI $WHO_TEI $MAL_DV $MAL_PSI $MAL_TEI
  #node ouCompare.js --whoURL=$WHOURL --malURL=$MALURL --user=$USER --pass=$PASSWORD --whoRoot=$WHOROOT --malRoot=$MALROOT
}

delete_sql_views() {
  echo 'Cleaning SQL views from WHO instance'
  curl -X DELETE -u $USER:$PASSWORD $WHOURL/api/sqlViews/$WHO_DV
  curl -X DELETE -u $USER:$PASSWORD $WHOURL/api/sqlViews/$WHO_PSI
  curl -X DELETE -u $USER:$PASSWORD $WHOURL/api/sqlViews/$WHO_TEI
  echo 'Cleaning SQL views from MAL instance'
  curl -X DELETE -u $USER:$PASSWORD $MALURL/api/sqlViews/$MAL_DV
  curl -X DELETE -u $USER:$PASSWORD $MALURL/api/sqlViews/$MAL_PSI
  curl -X DELETE -u $USER:$PASSWORD $MALURL/api/sqlViews/$MAL_TEI
}

##################################################
init_variables
post_who_sql_views
post_mal_sql_views
run_comparison
delete_sql_views
