begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);
select is(job_opening_key('https://Strongbridge.example/jobs/314/?utm_source=email#apply'),
          job_opening_key('https://strongbridge.example/jobs/314'), 'tracking parameters do not change an opening');
select isnt(job_opening_key('https://strongbridge.example/jobs/314'),
            job_opening_key('https://strongbridge.example/jobs/417'), 'different postings on the same site');
select is(job_opening_key('https://job-boards.greenhouse.io/team/jobs/123'),
          job_opening_key('https://boards.greenhouse.io/embed/job_app?for=team&token=123'), 'Greenhouse requisition');
select is(job_opening_key('https://team.wd5.myworkdayjobs.com/en-US/Jobs/job/TX/Developer_R-123'),
          job_opening_key('https://team.wd5.myworkdayjobs.com/Jobs/job/TX/Engineer_R-123/apply'), 'Workday requisition survives a title edit');
select isnt(job_opening_key('https://team.wd5.myworkdayjobs.com/Jobs/job/TX/Engineer_R-123'),
            job_opening_key('https://other.wd5.myworkdayjobs.com/Jobs/job/TX/Engineer_R-123'), 'Workday tenant scopes requisitions');
select isnt(job_opening_key('https://careers.example/job?id=1'), job_opening_key('https://careers.example/job?id=2'), 'query identifies an opening');
select isnt(job_opening_key('https://careers.example/#/jobs/1'), job_opening_key('https://careers.example/#/jobs/2'), 'client-side routes identify different openings');
select is(job_opening_key('https://careers.example/jobs/?utm_source=email'), null::text, 'generic careers page cannot identify an opening');
select is(job_opening_key('https://jobs.lever.co/company/70fabed1-deef-44ea-b0a0-0b4e207cadff/apply'),
          job_opening_key('https://jobs.lever.co/company/70fabed1-deef-44ea-b0a0-0b4e207cadff'), 'Lever application and posting URLs identify the same opening');
select * from finish();
rollback;
