workspace "AI Infra Target Architecture" "Target architecture for a small local-checkout LangGraph/LangChain modular-monolith agent runtime starter slice." {

    model {
        user = person "Chat user" "A person who interacts with a starter agent through a chat channel."
        maintainer = person "Maintainer" "Operates the stack and deploys versioned changes from the local checkout."

        agentRuntime = softwareSystem "Agent Runtime" "Modular-monolith runtime that routes channel messages to local versioned scratch and carshare agent systems, executes synchronous LangGraph/LangChain workflows, and integrates with separately deployed services." {
            agentRuntimeApp = container "Agent Runtime App" "DIY modular monolith for channel adapters, routing, sessions, synchronous graph execution, LangChain node hosting, permission policy, local configuration loading, tool/model clients, and runtime persistence." "Application container using LangGraph and LangChain" {
                telegramAdapter = component "Telegram Adapter" "Receives Telegram updates, normalizes channel identity, and sends Telegram responses." "Telegram Bot API adapter"
                discordAdapter = component "Discord Adapter" "Receives Discord events when configured, normalizes channel identity, and sends Discord responses." "Discord API adapter"
                messageNormalizer = component "Message Normalizer" "Converts channel-specific events into runtime message envelopes with sender, chat, and message identity." "Application component"
                messageRouter = component "Message Router" "Selects the configured starter agent system for a channel and session." "Application component"
                sessionManager = component "Session Manager" "Manages channel bindings, session metadata, message records, run records, and conversational continuity." "Application component"
                agentSystemLoader = component "Agent System Loader" "Loads scratch and carshare agent-system graph definitions, prompts, permissions, and tool configuration from the deployed local checkout." "Local config loader"
                graphRunner = component "Graph Runner" "Runs selected LangGraph graphs synchronously per message and follows graph edges without checkpoint/resume support in the starter slice." "LangGraph"
                langchainNodeHost = component "LangChain Node Host" "Hosts configured agent and tool nodes that call models and tools according to the selected graph definition." "LangChain"
                modelClient = component "Model Client" "Calls AWS Bedrock directly for initial model integration." "AWS Bedrock provider clients"
                toolClientLayer = component "Tool Client Layer" "Provides HTTP clients for Carshare Service tools." "HTTP/API clients"
                permissionPolicy = component "Permission Policy" "Evaluates configured tool allowlists and side-effect classes before tool execution." "Policy component"

                scratchGraph = component "Scratch Chat Graph" "Configured graph from agent-systems/scratch/graph.yaml for direct assistant chat." "Versioned graph configuration"
                scratchAssistantAgent = component "Scratch Assistant Agent" "Configured assistant node hosted by the runtime; not an independently deployed service." "Prompt/configured graph node"
                carshareGraph = component "Carshare Agent Graph" "Configured graph from agent-systems/carshare/graph.yaml for carshare ledger assistance." "Versioned graph configuration"
                parserAgent = component "Parser Agent" "Configured carshare node that parses and classifies user requests." "Prompt/configured graph node"
                validationStep = component "Validation Step" "Configured carshare node that validates parsed refill and handover requests before tool calls." "Configured graph node"
                ledgerToolStep = component "Ledger Tool Step" "Configured carshare node that invokes the Carshare Service HTTP API for ledger reads and writes." "Configured graph node"
                responseComposerAgent = component "Response Composer Agent" "Configured carshare node that composes user-facing responses from graph and ledger results." "Prompt/configured graph node"
            }
            carshareService = container "Carshare Service" "Separate domain HTTP service that owns carshare project, ledger event, and summary behavior for agents and possible future non-agent clients." "Express HTTP service"
            postgres = container "Postgres" "Stores starter runtime channel bindings, sessions, messages, runs, tool invocation audit, and Carshare Service-owned domain data." "PostgreSQL/pgvector" "Database"
        }

        telegram = softwareSystem "Telegram" "External chat channel used by users and groups." "External System"
        discord = softwareSystem "Discord" "External chat channel with independently configured bindings; disabled unless configured." "External System"
        modelProviders = softwareSystem "External Model Providers" "Hosted LLM providers; initial runtime integration calls AWS Bedrock directly using configured Bedrock aliases." "External System"

        user -> telegram "Sends and receives bot messages" "Telegram client"
        user -> discord "Sends and receives bot messages" "Discord client"
        telegram -> user "Displays bot responses" "Telegram client"
        discord -> user "Displays bot responses" "Discord client"
        maintainer -> agentRuntimeApp "Deploys and operates the local-checkout runtime" "Operational access"

        telegram -> agentRuntimeApp "Delivers Telegram updates" "Telegram Bot API"
        discord -> agentRuntimeApp "Delivers Discord events when enabled" "Discord API"
        agentRuntimeApp -> telegram "Sends Telegram responses" "Telegram Bot API"
        agentRuntimeApp -> discord "Sends Discord responses when enabled" "Discord API"
        agentRuntimeApp -> carshareService "Calls carshare health, project, ledger, events, and summary endpoints" "HTTP/JSON"
        carshareService -> postgres "Owns carshare project, event, and summary data access" "SQL"
        agentRuntimeApp -> postgres "Persists runtime channel bindings, sessions, messages, runs, and tool invocation audit; does not write carshare domain tables during normal operation" "SQL"
        agentRuntimeApp -> modelProviders "Requests model completions directly for initial AWS Bedrock integration" "AWS Bedrock provider API"

        telegram -> telegramAdapter "Delivers Telegram updates to the adapter" "Telegram Bot API"
        telegramAdapter -> telegram "Sends Telegram responses through the Bot API" "Telegram Bot API"
        discord -> discordAdapter "Delivers Discord events to the adapter when enabled" "Discord API"
        discordAdapter -> discord "Sends Discord responses through the Discord API when enabled" "Discord API"
        telegramAdapter -> messageNormalizer "Submits Telegram update envelopes" "In-process call"
        discordAdapter -> messageNormalizer "Submits Discord event envelopes" "In-process call"
        messageNormalizer -> messageRouter "Provides normalized channel messages" "In-process call"
        messageRouter -> sessionManager "Reads channel binding and session context" "In-process call"
        messageRouter -> agentSystemLoader "Selects local versioned starter agent system definition" "In-process call"
        messageRouter -> graphRunner "Starts selected per-message graph run" "In-process call"
        sessionManager -> postgres "Persists channel bindings, sessions, messages, runs, and tool invocation audit" "SQL"
        graphRunner -> langchainNodeHost "Executes configured graph nodes" "LangGraph node call"
        graphRunner -> permissionPolicy "Checks configured tool allowlist and side-effect class before tools" "In-process call"
        langchainNodeHost -> modelClient "Requests model calls for configured agent nodes" "In-process call"
        langchainNodeHost -> toolClientLayer "Requests configured tool calls" "In-process call"
        modelClient -> modelProviders "Calls models directly through AWS Bedrock initially" "AWS Bedrock provider API"
        toolClientLayer -> carshareService "Calls existing Carshare Service endpoints" "HTTP/JSON"

        graphRunner -> scratchGraph "Executes configured scratch chat graph" "LangGraph"
        scratchGraph -> scratchAssistantAgent "Runs assistant node" "Graph edge"
        graphRunner -> carshareGraph "Executes configured carshare graph" "LangGraph"
        carshareGraph -> parserAgent "Runs parser/classifier node" "Graph edge"
        parserAgent -> validationStep "Passes parsed request" "Graph edge"
        validationStep -> ledgerToolStep "Passes validated carshare operation" "Graph edge"
        ledgerToolStep -> responseComposerAgent "Returns ledger result" "Graph edge"
        responseComposerAgent -> telegramAdapter "Returns response event for channel delivery" "In-process call"
        ledgerToolStep -> toolClientLayer "Calls carshare HTTP client" "In-process call"

        production = deploymentEnvironment "Production" {
            oracleCloud = deploymentNode "Oracle Cloud" "Cloud provider hosting the small self-managed stack." "OCI" {
                oracleVm = deploymentNode "Oracle VM" "Single Oracle Free Tier ARM VM." "VM.Standard.A1.Flex" {
                    docker = deploymentNode "Docker Compose" "Docker Compose project on the VM." "Docker" {
                        agentRuntimeAppInstance = containerInstance agentRuntimeApp
                        carshareServiceInstance = containerInstance carshareService
                        postgresInstance = containerInstance postgres
                    }
                }
            }
        }
    }

    views {
        systemContext agentRuntime "system-context" "System context for the thin starter modular-monolith agent runtime." {
            include *
            autolayout lr
        }

        container agentRuntime "container" "Containers in the starter agent runtime." {
            include *
            autolayout lr
        }

        component agentRuntimeApp "agent-runtime-app-components" "Internal modules and configured starter graph nodes hosted by the Agent Runtime App." {
            include *
            autolayout lr
        }

        component agentRuntimeApp "carshare-agent-graph" "Configured Carshare agent graph nodes and their Carshare Service interaction." {
            include carshareGraph parserAgent validationStep ledgerToolStep responseComposerAgent toolClientLayer carshareService postgres
            autolayout lr
        }

        dynamic agentRuntime "dynamic-message-response" "Message-to-response flow through the thin starter Agent Runtime App." {
            user -> telegram "1. Sends a message"
            telegram -> agentRuntimeApp "2. Delivers update"
            agentRuntimeApp -> postgres "3. Loads channel binding and session state"
            agentRuntimeApp -> modelProviders "4. Requests model completion when needed"
            agentRuntimeApp -> postgres "5. Stores message, run, and tool audit records"
            agentRuntimeApp -> telegram "6. Sends bot response"
            telegram -> user "7. Displays response"
            autolayout lr
        }

        dynamic agentRuntimeApp "dynamic-carshare-flow" "Carshare message flow through configured graph nodes and the separate Carshare Service." {
            user -> telegram "1. Sends carshare request"
            telegram -> telegramAdapter "2. Delivers update"
            telegramAdapter -> messageNormalizer "3. Normalizes channel identity"
            messageNormalizer -> messageRouter "4. Routes to the carshare graph"
            messageRouter -> graphRunner "5. Starts per-message graph run"
            graphRunner -> carshareGraph "6. Executes carshare graph"
            carshareGraph -> parserAgent "7. Parses and classifies request"
            parserAgent -> validationStep "8. Passes parsed operation"
            validationStep -> ledgerToolStep "9. Passes validated ledger action"
            ledgerToolStep -> toolClientLayer "10. Calls carshare HTTP client"
            toolClientLayer -> carshareService "11. Calls HTTP/JSON endpoint"
            carshareService -> postgres "12. Reads or writes owned carshare data"
            ledgerToolStep -> responseComposerAgent "13. Provides ledger result"
            responseComposerAgent -> telegramAdapter "14. Produces response event"
            telegramAdapter -> telegram "15. Sends bot response"
            telegram -> user "16. Displays response"
            autolayout lr
        }

        deployment agentRuntime "Production" "deployment-oracle-compose" "Deployment on Oracle VM using Docker Compose." {
            include *
            autolayout lr
        }

        styles {
            element "Person" {
                shape person
                background #08427b
                color #ffffff
            }
            element "Software System" {
                background #1168bd
                color #ffffff
            }
            element "Container" {
                background #438dd5
                color #ffffff
            }
            element "Component" {
                background #85bbf0
                color #000000
            }
            element "Database" {
                shape cylinder
                background #2f95c8
                color #ffffff
            }
            element "External System" {
                background #999999
                color #ffffff
            }
            element "Optional" {
                border dashed
            }
            element "Future Optional" {
                border dashed
                opacity 40
            }
        }
    }

    configuration {
        scope softwareSystem
    }
}
