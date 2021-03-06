    // a function to create a query to get keyword data
function createCreativesDisplayFileQuery(schemas, site) {
  return `
-- This query is designed to show only AdWords Dispay campaign performance for use /outside of PaidPal. The Display metrics will be calculated here and joined to the results of the PaidPal query for use outside of PaidPal.
WITH adw_base_1 AS (
                SELECT DISTINCT 
                    adgroup, 
                    day, 
                    MAX(_sdc_report_datetime) AS _sdc_report_datetime
                FROM ${schemas.google}.AD_PERFORMANCE_REPORT
                -- ONLY USE DATE RANGE ONCE WE DUMP ALL THE DATA INITIALLY
                -- TODO: fix
                -- WHERE day::date BETWEEN \'".$this->start."\' and \'".$this->now."\'
                --WHERE day::date > ${utils.refreshrange("day")}
                -- ONLY USE DATE RANGE ONCE WE DUMP ALL THE DATA INITIALLY
                GROUP BY 1,2
                
            ),
            -- Get most adwords keyword data (excluding impressions)
            adwords_ad AS (
                SELECT DISTINCT
                    B.account,  
                    B.customerid,
                    CASE when B.account is not null then \'AdWords\' else null end AS platform,
                    B.campaignid,
                    B.adgroupid,
                    B.adid,
                    A.adgroup,
                   -- B.campaign,
                    cast(null as string) as campaign,
                    SUM(B.clicks) AS clicks,
                    SUM(B.cost/1000000.00) AS cost,
                    B.finalurl,
                    B.headline1,
                    B.headline2,
                    -- Meso Prog and Annuity do not have the headline3 column...
                    ${(site == 'mesotheliomaprognosis.com' || site == 'annuity.org') ? 'null AS expandedtextadheadline3,' : 'B.expandedtextadheadline3,'}
                    -- Annuity sites do not have the same description format
                    ${(site == 'annuity.org' || site == 'structuredsettlements.com') ? 'TRIM(COALESCE(B.description, \'\') || \' \' || COALESCE(B.descriptionline1, \'\') || \' \' || COALESCE(B.descriptionline2, \'\'))' : 'TRIM(COALESCE(B.description, \'\') || \' \' || COALESCE(B.expandedtextaddescription2, \'\'))'} AS description,
                    B.adgroupstate,
                    B.campaignstate,
                    B.adstate,
                    A.day,
                    A._sdc_report_datetime
                FROM adw_base_1 AS A
                INNER JOIN ${schemas.google}.AD_PERFORMANCE_REPORT AS B 
                ON A.adgroup = B.adgroup AND 
                A._sdc_report_datetime = B._sdc_report_datetime AND 
                A.day = B.day
               -- WHERE LOWER(B.campaign) LIKE '%display%'
                GROUP BY 
                    B.account,
                    B.customerid,
                    B.campaignid,
                    B.adgroupid,
                    B.adid, 
                    A.adgroup,
                    campaign, 
                    B.finalurl,
                    B.headline1,
                    B.headline2,
                    expandedtextadheadline3,
                    B.description,
                    -- Annuity sites do not have the same description format
                    ${(site == 'annuity.org' || site == 'structuredsettlements.com') ?
                        'B.descriptionline1, B.descriptionline2,' :
                        'B.expandedtextaddescription2,'
                    }
                    B.adgroupstate,
                    B.campaignstate,
                    B.adstate,
                    A.day,
                    A._sdc_report_datetime
            ),
            -- Get headline impressions
            adwords_headline_impressions AS (
                SELECT DISTINCT
                    B.customerid,
                    B.campaignid,
                    B.adgroupid,
                    B.adid,
                    A.day,
                    SUM(B.impressions) AS impressions,
                    A._sdc_report_datetime
                FROM adw_base_1 AS A
                INNER JOIN ${schemas.google}.AD_PERFORMANCE_REPORT AS B 
                ON A.adgroup = B.adgroup AND 
                    A._sdc_report_datetime = B._sdc_report_datetime AND 
                    A.day = B.day
                WHERE B.clicktype = 'Headline'
                GROUP BY 
                    B.customerid,
                    B.campaignid,
                    B.adgroupid,
                    B.adid, 
                    A.day,
                    A._sdc_report_datetime
            ),
            -- Get phone impressions
           adwords_phone_impressions AS (
                SELECT DISTINCT
                    B.customerid,
                    B.campaignid,
                    B.adgroupid,
                    B.adid,
                    A.day,
                    SUM(B.impressions) AS impressions,
                    A._sdc_report_datetime
                FROM adw_base_1 AS A
                INNER JOIN ${schemas.google}.AD_PERFORMANCE_REPORT AS B 
                ON A.adgroup = B.adgroup AND 
                    A._sdc_report_datetime = B._sdc_report_datetime AND 
                    A.day = B.day
                WHERE B.clicktype = 'Phone calls'
                GROUP BY 
                    B.customerid,
                    B.campaignid,
                    B.adgroupid,
                    B.adid, 
                    A.day,
                    A._sdc_report_datetime
           ),
           -- get daily campaign budget
           budget_base as (
  select distinct
     CampaignPerformanceReport.campaignid AS Campaignid,
     max(CampaignPerformanceReport._sdc_report_datetime) as _sdc_report_datetime
    from ${schemas.google}.CAMPAIGN_PERFORMANCE_REPORT AS CampaignPerformanceReport
  group by 1 
  ),
budget as (
SELECT distinct
budget_base.campaignid AS campaignid,
       CampaignPerformanceReport.campaign AS campaign,
       CampaignPerformanceReport.budgetid AS budgetid,
       CampaignPerformanceReport.hasrecommendedbudget AS has_recommended_budget,
       CampaignPerformanceReport.budgetperiod AS budget_period,
     CampaignPerformanceReport.budget/1000000 AS budget
     
FROM budget_base
inner join ${schemas.google}.CAMPAIGN_PERFORMANCE_REPORT AS CampaignPerformanceReport on budget_base.campaignid = CampaignPerformanceReport.campaignid and budget_base._sdc_report_datetime = CampaignPerformanceReport._sdc_report_datetime

),
            -- Aggregate all adwords data together
            final_adwords AS (
                SELECT DISTINCT
                    A.account,
                    A.customerid,
                    A.platform,
                    A.campaignid,
                    A.adgroupid,
                    A.adid,
                    A.adgroup,
                    A.campaign,
                    A.clicks,
                    A.cost,
                    A.finalurl,
                    A.headline1,
                    A.headline2,
                    A.expandedtextadheadline3,
                    A.description,
                    A.adgroupstate,
                    A.campaignstate,
                    A.adstate,
                    A.day,
                    COALESCE(B.impressions, C.impressions) AS impressions,
                    D.budget
                FROM adwords_ad AS A
                LEFT JOIN adwords_headline_impressions AS B 
                ON A.campaignid = B.campaignid 
                AND A.adgroupid = B.adgroupid 
                AND A.adid = B.adid 
                AND A.day = B.day
                LEFT JOIN adwords_phone_impressions AS C 
                ON A.campaignid = C.campaignid 
                AND A.adgroupid = C.adgroupid 
                AND A.adid = C.adid 
                AND A.day = C.day
                LEFT JOIN budget as D 
                ON A.campaignid = D.campaignid
            ),
           
            joined_data as (
                -- Adwords final selection
                SELECT 
                    account,  
                    customerid AS account_id,
                    platform,
                    campaignid AS campaign_id,
                    adgroupid AS adgroup_id,
                    adid AS creative_id,
                    adgroup,
                    campaign,
                    COALESCE(impressions, 0) AS impressions, 
                    clicks,
                    cost,
                    finalurl AS url,
                    headline1,
                    headline2,
                    expandedtextadheadline3 AS headline3,
                    description,
                    adgroupstate AS adgroup_state,
                    campaignstate AS campaign_state,
                    adstate AS creative_state,
                    day AS date,
                    budget
                FROM final_adwords
                
            )
            -- Aggregate final data
            select
            account_id as account_id,
            campaign_id as campaign_id,
            adgroup_id as adgroup_id,
            creative_id as creative_id,
            cast(date as date)as date,
            platform as platform,
            account,
            adgroup,
            campaign,
            sum(impressions) as impressions, 
            sum(clicks) as clicks,
            sum(cost) as cost,
            url,
            headline1,
            headline2,
            headline3,
            description,
            adgroup_state,
            campaign_state,
            creative_state,
            budget
            from joined_data
           
            group by 1,2,3,4,5,6,7,8,9,13,14,15,16,17,18,19,20,21
           
`;
}

// a function to create an creative file table given some
// sites config parameters
function createDisplayCreativeTable(item) {
  publish(`displayonly_ppc_creatives_${item.name}`).query(
      createCreativesDisplayFileQuery(
        item.schemas,
        item.site)
  );
}

vars.config.filter(table => !!table.schemas.google).forEach(createDisplayCreativeTable);

/* // a function to create an creative file operation given some
// sites config parameters
function createCreativeFileOperation(item) {
    let table_name = `creatives_${item.name}`;
  operate(`creatives_${item.name}_unload`).queries(
    ctx => utils.unloadToS3(`select * from ${ctx.ref(table_name)}`)
  );
} 

vars.config.forEach(createCreativeFileOperation);
*/