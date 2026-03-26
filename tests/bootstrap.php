<?php
/**
 * @file tests/bootstrap.php
 * @description PHPUnit bootstrap: loads the API dependencies for all tests.
 *
 * This file is referenced in phpunit.xml as the bootstrap.
 * It runs before any test class is instantiated.
 *
 * RESPONSIBILITIES:
 *   1. Load Composer autoloader (for PHPUnit itself).
 *   2. Load the API source files that tests will exercise.
 *   3. Load shared test utilities (TestPhpInputStream, TestCase base class).
 *   4. The APP_TESTING environment variable is set in phpunit.xml
 *      (env name="APP_TESTING" value="1"), so Database::getInstance()
 *      will use sqlite::memory: automatically.
 *
 * WHAT IS NOT LOADED HERE:
 *   - api/index.php (the router) — tests bypass the HTTP layer and call
 *     controller methods directly. This avoids needing a running web server.
 *
 * @see phpunit.xml for environment variable configuration.
 * @see api/Database.php for the in-memory DB setup.
 */

declare(strict_types=1);

// 1. Composer autoloader (PHPUnit classes)
require_once __DIR__ . '/../vendor/autoload.php';

// 2. API source files
require_once __DIR__ . '/../api/config.php';
require_once __DIR__ . '/../api/Database.php';
require_once __DIR__ . '/../api/migrate.php';
require_once __DIR__ . '/../api/auth.php';
require_once __DIR__ . '/../api/middleware.php';
require_once __DIR__ . '/../api/controllers/CampaignController.php';
require_once __DIR__ . '/../api/controllers/CharacterController.php';
require_once __DIR__ . '/../api/controllers/RulesController.php';
require_once __DIR__ . '/../api/controllers/GlobalRulesController.php';
require_once __DIR__ . '/../api/controllers/UiLocalesController.php';
require_once __DIR__ . '/../api/controllers/UserController.php';

// 3. Shared test utilities
require_once __DIR__ . '/TestCase.php';
require_once __DIR__ . '/TestPhpInputStream.php';
