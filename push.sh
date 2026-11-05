#!/usr/bin/env bash
# ==============================================================================
# Road & Trails Lagangilang - GitHub Push Script
# Usage:
#   ./push.sh
#   ./push.sh "Your custom commit message"
# ==============================================================================

set -e

# Terminal Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${CYAN}🚀 Road & Trails Lagangilang - Git Push Assistant${NC}"
echo -e "${BLUE}====================================================${NC}"

# Check if git is available
if ! command -v git &> /dev/null; then
    echo -e "${RED}❌ Git is not installed or not in PATH.${NC}"
    exit 1
fi

# Determine current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")
echo -e "${BLUE}📌 Current Git Branch:${NC} ${GREEN}${CURRENT_BRANCH}${NC}"

# Check remote repository
REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REMOTE_URL" ]; then
    echo -e "${RED}❌ No remote 'origin' found. Please configure a remote repository first.${NC}"
    exit 1
fi
echo -e "${BLUE}🌐 Remote Repository:${NC} ${GREEN}${REMOTE_URL}${NC}"
echo ""

# Verify Vite build integrity before pushing
echo -e "${YELLOW}🔍 Running build verification...${NC}"
if npm run build; then
    echo -e "${GREEN}✅ Build verification passed!${NC}"
else
    echo -e "${RED}❌ Build failed! Aborting push to prevent pushing broken code.${NC}"
    exit 1
fi
echo ""

# Check working tree status
if [ -z "$(git status --porcelain)" ]; then
    # Check if there are local unpushed commits
    UNPUSHED=$(git log @{u}.. --oneline 2>/dev/null || echo "")
    if [ -z "$UNPUSHED" ]; then
        echo -e "${GREEN}✨ Working directory clean and everything is up-to-date with GitHub!${NC}"
        exit 0
    else
        echo -e "${YELLOW}ℹ️  No new file changes, but unpushed local commits detected:${NC}"
        echo "$UNPUSHED"
        echo ""
        read -p "Push unpushed commits to origin/${CURRENT_BRANCH}? [Y/n]: " PUSH_CONFIRM
        PUSH_CONFIRM=${PUSH_CONFIRM:-Y}
        if [[ "$PUSH_CONFIRM" =~ ^[Yy]$ ]]; then
            git push origin "$CURRENT_BRANCH"
            echo -e "${GREEN}🎉 Pushed successfully!${NC}"
        fi
        exit 0
    fi
fi

# Display current changes
echo -e "${CYAN}📝 Changed files:${NC}"
git status --short
echo ""

# Get commit message from argument or interactive input
COMMIT_MSG="$1"
if [ -z "$COMMIT_MSG" ]; then
    DEFAULT_MSG="Update: routing navigation, emergency hotlines & offline map fixes ($(date '+%Y-%m-%d %H:%M'))"
    echo -e "${YELLOW}Enter commit message (Press Enter for default):${NC}"
    echo -e "${BLUE}Default:${NC} ${DEFAULT_MSG}"
    read -p "> " USER_MSG
    COMMIT_MSG="${USER_MSG:-$DEFAULT_MSG}"
fi

echo ""
echo -e "${BLUE}📦 Staging changes...${NC}"
git add -A

echo -e "${BLUE}💾 Committing changes:${NC} ${GREEN}\"$COMMIT_MSG\"${NC}"
git commit -m "$COMMIT_MSG"

echo -e "${BLUE}🚀 Pushing to GitHub (${CURRENT_BRANCH})...${NC}"
if git push origin "$CURRENT_BRANCH"; then
    echo ""
    echo -e "${GREEN}====================================================${NC}"
    echo -e "${GREEN}🎉 Successfully pushed to GitHub!${NC}"
    echo -e "${CYAN}🔗 ${REMOTE_URL}${NC}"
    echo -e "${GREEN}====================================================${NC}"
else
    echo ""
    echo -e "${RED}❌ Push failed.${NC}"
    echo -e "${YELLOW}Tip: If this is an authentication issue, ensure your GitHub Personal Access Token or SSH keys are configured.${NC}"
    exit 1
fi
