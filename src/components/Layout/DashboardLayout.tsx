"use client";

import React, { useState } from 'react';
import { 
  Box, Drawer, AppBar, Toolbar, List, Typography, Divider, 
  IconButton, ListItem, ListItemButton, ListItemIcon, ListItemText, 
  useMediaQuery, useTheme, Avatar, Button 
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LinkIcon from '@mui/icons-material/Link';
import SettingsIcon from '@mui/icons-material/Settings';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import LogoutIcon from '@mui/icons-material/Logout';
import { useRouter, usePathname } from 'next/navigation';

const drawerWidth = 280;

interface NavItem {
  text: string;
  icon: React.ReactNode;
  path: string;
}

const navItems: NavItem[] = [
  { text: 'PM Dashboard', icon: <AnalyticsIcon />, path: '/pm' },
  { text: 'Link Generator', icon: <LinkIcon />, path: '/admin' },
  { text: 'Workspace Settings', icon: <SettingsIcon />, path: '/admin/settings' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'secondary.main', color: 'white' }}>
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box sx={{ 
          width: 40, height: 40, borderRadius: '10px', 
          bgcolor: 'primary.main', display: 'flex', 
          justifyContent: 'center', alignItems: 'center',
          boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)'
        }}>
          <DashboardIcon sx={{ color: 'white' }} />
        </Box>
        <Typography variant="h6" fontWeight="700" sx={{ letterSpacing: '-0.02em' }}>
          QA Triage
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', mx: 2 }} />

      <List sx={{ px: 2, py: 3, flexGrow: 1 }}>
        {navItems.map((item) => {
          const isActive = pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
              <ListItemButton 
                onClick={() => {
                  router.push(item.path);
                  if (isMobile) setMobileOpen(false);
                }}
                sx={{
                  borderRadius: 2,
                  bgcolor: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
                  transition: '0.2s'
                }}
              >
                <ListItemIcon sx={{ 
                  color: isActive ? 'primary.light' : 'rgba(255,255,255,0.6)',
                  minWidth: 40 
                }}>
                  {item.icon}
                </ListItemIcon>
                
                {/* BUG FIXED HERE: Using explicit Typography instead of primaryTypographyProps */}
                <ListItemText 
                  disableTypography
                  primary={
                    <Typography sx={{ 
                      fontSize: '0.95rem', 
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? 'white' : 'rgba(255,255,255,0.7)'
                    }}>
                      {item.text}
                    </Typography>
                  } 
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>

      <Box sx={{ p: 2, mt: 'auto' }}>
        <Box sx={{ 
          p: 2, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.03)', 
          display: 'flex', alignItems: 'center', gap: 2, mb: 2 
        }}>
          <Avatar sx={{ width: 32, height: 32, fontSize: '0.8rem', bgcolor: 'primary.dark' }}>JD</Avatar>
          <Box sx={{ overflow: 'hidden' }}>
            <Typography variant="body2" fontWeight="600" noWrap>John Doe</Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }} noWrap>Admin Access</Typography>
          </Box>
        </Box>
        <Button 
          fullWidth startIcon={<LogoutIcon />} 
          sx={{ color: 'rgba(255,255,255,0.5)', justifyContent: 'flex-start', px: 2, textTransform: 'none' }}
        >
          Logout
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      {isMobile && (
        <AppBar position="fixed" sx={{ bgcolor: 'white', color: 'text.primary', boxShadow: 'none', borderBottom: '1px solid #e2e8f0' }}>
          <Toolbar>
            <IconButton edge="start" onClick={handleDrawerToggle} sx={{ mr: 2 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h6" fontWeight="700">QA Triage</Typography>
          </Toolbar>
        </AppBar>
      )}

      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={isMobile ? "temporary" : "permanent"}
          open={isMobile ? mobileOpen : true}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': { 
              width: drawerWidth, 
              boxSizing: 'border-box', 
              borderRight: 'none',
              boxShadow: '4px 0 24px rgba(0,0,0,0.02)'
            },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 3, md: 6 },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: { xs: 8, md: 0 }, 
          minHeight: '100vh',
          bgcolor: 'background.default'
        }}
      >
        {children}
      </Box>
    </Box>
  );
}