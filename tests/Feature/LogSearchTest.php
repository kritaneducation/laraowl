<?php

use App\Models\Project;
use App\Models\Record;
use App\Services\IngestService;
use App\Services\RecordService;

function ingestLogs(Project $project, array $records): void
{
    app(IngestService::class)->ingest($project, $records);
}

function logResults(Project $project, ?string $search): array
{
    return collect(app(RecordService::class)->getLogRecords($project, $search, '24h')->items())
        ->map(fn ($r) => $r->payload['message'] ?? null)
        ->all();
}

test('a log stores its level and message in the searchable column', function () {
    $project = Project::factory()->create();

    ingestLogs($project, [
        ['t' => 'log', 'level' => 'error', 'message' => 'Database connection timed out'],
    ]);

    $record = Record::where('project_id', $project->id)->where('type', 'log')->first();

    // The level is folded in so searching a level still finds the entry.
    expect($record->message)->toBe('error Database connection timed out');
});

test('log search matches words in the message', function () {
    $project = Project::factory()->create();

    ingestLogs($project, [
        ['t' => 'log', 'level' => 'error', 'message' => 'Database connection timed out'],
        ['t' => 'log', 'level' => 'info', 'message' => 'User signed in'],
        ['t' => 'log', 'level' => 'warning', 'message' => 'Cache miss for homepage'],
    ]);

    expect(logResults($project, 'Database'))->toBe(['Database connection timed out'])
        ->and(logResults($project, 'homepage'))->toBe(['Cache miss for homepage']);
})->skip(
    fullTextIsBlindInsideTransaction(...),
    'InnoDB only updates FULLTEXT indexes at commit, so a transactional test cannot see its own rows.',
);

test('log search matches the level as a term', function () {
    $project = Project::factory()->create();

    ingestLogs($project, [
        ['t' => 'log', 'level' => 'error', 'message' => 'Payment failed'],
        ['t' => 'log', 'level' => 'error', 'message' => 'Timeout reached'],
        ['t' => 'log', 'level' => 'info', 'message' => 'All good'],
    ]);

    expect(logResults($project, 'error'))->toHaveCount(2)
        ->and(logResults($project, 'info'))->toBe(['All good']);
})->skip(
    fullTextIsBlindInsideTransaction(...),
    'InnoDB only updates FULLTEXT indexes at commit, so a transactional test cannot see its own rows.',
);

test('a search that matches nothing returns an empty page', function () {
    $project = Project::factory()->create();

    ingestLogs($project, [
        ['t' => 'log', 'level' => 'info', 'message' => 'Nothing to see'],
    ]);

    $paginator = app(RecordService::class)->getLogRecords($project, 'nonexistentterm', '24h');

    expect($paginator->total())->toBe(0);
});

test('log search no longer scans the JSON payload column', function () {
    $project = Project::factory()->create();
    ingestLogs($project, [['t' => 'log', 'level' => 'info', 'message' => 'hello world']]);

    DB::flushQueryLog();
    DB::enableQueryLog();
    app(RecordService::class)->getLogRecords($project, 'hello', '24h');
    $queries = collect(DB::getQueryLog())->pluck('query')->implode(' ');
    DB::disableQueryLog();

    // The search targets the narrow message column, not the fat payload JSON.
    expect($queries)->not->toContain('`payload` like')
        ->and($queries)->toContain('message');
});

test('the backfill lifts the message out of legacy log payloads', function () {
    $project = Project::factory()->create();

    Record::create([
        'project_id' => $project->id,
        'type' => 'log',
        'fingerprint' => null,
        'payload' => ['level' => 'warning', 'message' => 'legacy disk warning'],
        'created_at' => now(),
    ]);

    expect(Record::where('project_id', $project->id)->value('message'))->toBeNull();

    $this->artisan('laraowl:rollups:backfill')->assertExitCode(0);

    expect(Record::where('project_id', $project->id)->value('message'))->toBe('warning legacy disk warning')
        ->and(logResults($project, 'disk'))->toBe(['legacy disk warning']);
})->skip(
    fullTextIsBlindInsideTransaction(...),
    'InnoDB only updates FULLTEXT indexes at commit, so a transactional test cannot see its own rows.',
);
