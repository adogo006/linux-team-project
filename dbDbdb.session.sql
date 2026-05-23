
-- @ data remove
TRUNCATE TABLE project_logs, file_nodes, projects RESTART IDENTITY CASCADE
;



-- @ table drop
DROP TABLE IF EXISTS project_logs, file_nodes, projects CASCADE
;
